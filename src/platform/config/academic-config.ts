// Centralized Academic Calendar Configuration
import { supabase } from "@/platform/database/supabase/client";

export interface AcademicTerm {
  id: string; // e.g. "s1", "s2" or uuid
  label: string; // e.g. "الفصل الدراسي الأول", "الفصل الدراسي الثاني"
  startDate?: string | null;
  endDate?: string | null;
  orderIndex?: number;
}

export interface AcademicYear {
  id: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
}

// Default terms to be used as fallback or initial state (exactly 2 terms)
const DEFAULT_TERMS: AcademicTerm[] = [
  { id: "s1", label: "الفصل الدراسي الأول", orderIndex: 1 },
  { id: "s2", label: "الفصل الدراسي الثاني", orderIndex: 2 },
];

const DEFAULT_YEAR: AcademicYear = {
  id: "default-year",
  name: "العام الدراسي الحالي 1447هـ",
  isActive: true,
};

// In-memory cache for synchronous functions
let cachedTerms: AcademicTerm[] = [...DEFAULT_TERMS];
let cachedYear: AcademicYear = { ...DEFAULT_YEAR };
let hasLoadedFromDb = false;

// Event dispatched when calendar cache is updated
export const ACADEMIC_CONFIG_EVENT = "academic-config-changed";

/**
 * Returns the active academic terms list synchronously from cache.
 * Updates on login or when query resolves.
 */
export function getActiveTerms(): AcademicTerm[] {
  return cachedTerms;
}

/**
 * Returns the current count of academic terms.
 */
export function getTermsCount(): number {
  return cachedTerms.length;
}

/**
 * Returns a map of term IDs to Arabic labels.
 */
export function getTermsLabelMap(): Record<string, string> {
  const map: Record<string, string> = {};
  cachedTerms.forEach((term) => {
    map[term.id] = term.label;
  });
  return map;
}

/**
 * Returns the active academic year synchronously.
 */
export function getActiveAcademicYear(): AcademicYear {
  return cachedYear;
}

/**
 * Fetches the active academic year and terms from Supabase.
 * Updates the in-memory cache and dispatches an event on success.
 */
export async function fetchAcademicCalendar(): Promise<{
  year: AcademicYear;
  terms: AcademicTerm[];
}> {
  try {
    // 1. Fetch active academic year
    const { data: activeYears, error: yearError } = await supabase
      .from("academic_years")
      .select("id, label, start_date, end_date, is_active")
      .eq("is_active", true)
      .limit(1);

    if (yearError) {
      console.warn("Could not fetch active academic year from DB, using fallback:", yearError);
      return { year: cachedYear, terms: cachedTerms };
    }

    let yearData = activeYears?.[0];

    // If no active academic year is configured in DB, try fetching ANY academic year
    if (!yearData) {
      const { data: allYears, error: allYearsError } = await supabase
        .from("academic_years")
        .select("id, label, start_date, end_date, is_active")
        .limit(1);

      if (!allYearsError && allYears && allYears.length > 0) {
        yearData = allYears[0];
      }
    }

    if (!yearData) {
      // No academic years in DB at all, use default
      hasLoadedFromDb = true;
      return { year: cachedYear, terms: cachedTerms };
    }

    // 2. Fetch semesters for the determined academic year
    const { data: semesters, error: semError } = await supabase
      .from("semesters")
      .select("id, label, order_index, start_date, end_date")
      .eq("academic_year_id", yearData.id)
      .order("order_index", { ascending: true });

    if (semError) {
      console.warn("Could not fetch semesters for year from DB, using fallback:", semError);
      return {
        year: {
          id: yearData.id,
          name: yearData.label,
          startDate: yearData.start_date,
          endDate: yearData.end_date,
          isActive: yearData.is_active,
        },
        terms: cachedTerms,
      };
    }

    const mappedYear: AcademicYear = {
      id: yearData.id,
      name: yearData.label,
      startDate: yearData.start_date,
      endDate: yearData.end_date,
      isActive: yearData.is_active,
    };

    let mappedTerms: AcademicTerm[] = [];
    if (semesters && semesters.length > 0) {
      mappedTerms = semesters.map((s, index) => ({
        id: s.id, // Keep the actual table ID for proper database relationships
        label: s.label,
        startDate: s.start_date,
        endDate: s.end_date,
        orderIndex: s.order_index ?? index + 1,
      }));
    } else {
      // Fallback if year has no semesters
      mappedTerms = [...DEFAULT_TERMS];
    }

    // Update in-memory cache
    cachedTerms = mappedTerms;
    cachedYear = mappedYear;
    hasLoadedFromDb = true;

    // Dispatch custom event to notify listeners
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(ACADEMIC_CONFIG_EVENT));
    }

    return { year: mappedYear, terms: mappedTerms };
  } catch (error) {
    console.error("Error in fetchAcademicCalendar:", error);
    return { year: cachedYear, terms: cachedTerms };
  }
}

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * Hook to get the cached terms. Subscribes to updates so it re-renders
 * as soon as the database fetch resolves.
 */
export function useAcademicTerms(): AcademicTerm[] {
  const [terms, setTerms] = useState<AcademicTerm[]>(cachedTerms);

  useEffect(() => {
    const handleUpdate = () => {
      setTerms([...cachedTerms]);
    };

    if (typeof window !== "undefined") {
      window.addEventListener(ACADEMIC_CONFIG_EVENT, handleUpdate);
    }

    // In case they loaded before mounting, check if we need to update
    if (terms.length !== cachedTerms.length || terms[0]?.id !== cachedTerms[0]?.id) {
      setTerms([...cachedTerms]);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(ACADEMIC_CONFIG_EVENT, handleUpdate);
      }
    };
  }, [terms]);

  return terms;
}

/**
 * Hook to get the active academic year. Subscribes to updates.
 */
export function useActiveAcademicYear(): AcademicYear {
  const [year, setYear] = useState<AcademicYear>(cachedYear);

  useEffect(() => {
    const handleUpdate = () => {
      setYear({ ...cachedYear });
    };

    if (typeof window !== "undefined") {
      window.addEventListener(ACADEMIC_CONFIG_EVENT, handleUpdate);
    }

    if (year.id !== cachedYear.id) {
      setYear({ ...cachedYear });
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(ACADEMIC_CONFIG_EVENT, handleUpdate);
      }
    };
  }, [year]);

  return year;
}

/**
 * React Query hook to fetch and keep academic calendar state in sync
 */
export function useAcademicCalendar() {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ["academic-calendar"],
    queryFn: async () => {
      const result = await fetchAcademicCalendar();
      return result;
    },
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}
