/**
 * P1-B distribution snapshot RLS write-lock tests.
 *
 * SQL contract tests read the new migration.
 * In-memory tests replica USING/WITH CHECK predicates and table grants.
 *
 * This environment does not run a live PostgreSQL / PostgREST harness.
 * These tests do not prove live JWT RLS. They are mock/in-memory only.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const MIGRATION = join(
  ROOT,
  "supabase/migrations/20260813220000_distribution_snapshot_rpc_write_lock.sql",
);
const PREVIOUS_RLS = join(ROOT, "supabase/migrations/20260813193000_distribution_snapshots.sql");
const ATOMIC_RPC = join(
  ROOT,
  "supabase/migrations/20260813210000_approve_distribution_snapshot_atomic.sql",
);

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STRANGER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADMIN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PLAN_ID = "99999999-9999-4999-8999-999999999999";
const SNAPSHOT_ID = "77777777-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ITEM_ID = "66666666-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

type Command = "select" | "insert" | "update" | "delete";
type TableName = "distribution_snapshots" | "distribution_snapshot_items";

interface Actor {
  uid: string;
  isAdmin: boolean;
}

interface SnapshotRow {
  id: string;
  semester_plan_id: string;
  user_id: string;
}

interface ItemRow {
  id: string;
  snapshot_id: string;
}

const PLAN_OWNER_ID = OWNER;

const SNAPSHOT: SnapshotRow = {
  id: SNAPSHOT_ID,
  semester_plan_id: PLAN_ID,
  user_id: PLAN_OWNER_ID,
};

const ITEM: ItemRow = {
  id: ITEM_ID,
  snapshot_id: SNAPSHOT_ID,
};

const SNAPSHOT_GRANTS: Record<Command, boolean> = {
  select: true,
  insert: true,
  update: true,
  delete: false,
};

const ITEM_GRANTS: Record<Command, boolean> = {
  select: true,
  insert: true,
  update: false,
  delete: false,
};

function isSemesterPlanOwner(actor: Actor, planUserId: string): boolean {
  return planUserId === actor.uid || actor.isAdmin;
}

function rpcGate(guc: string | null): boolean {
  return guc === "approve_distribution_snapshot";
}

function snapshotPolicy(
  command: Command,
  actor: Actor,
  row: SnapshotRow,
  guc: string | null,
): boolean {
  const owner = isSemesterPlanOwner(actor, row.user_id);
  if (command === "select") return owner;
  if (command === "insert" || command === "update") {
    return owner && actor.isAdmin && rpcGate(guc);
  }
  return false;
}

function itemPolicy(command: Command, actor: Actor, item: ItemRow, guc: string | null): boolean {
  const snapshot = item.snapshot_id === SNAPSHOT.id ? SNAPSHOT : null;
  if (!snapshot) return false;
  const owner = isSemesterPlanOwner(actor, snapshot.user_id);
  if (command === "select") return owner;
  if (command === "insert") {
    return owner && actor.isAdmin && rpcGate(guc);
  }
  return false;
}

function postgrestAllowed(options: {
  table: TableName;
  command: Command;
  actor: Actor;
  guc?: string | null;
}): boolean {
  const guc = options.guc ?? null;
  const grants = options.table === "distribution_snapshots" ? SNAPSHOT_GRANTS : ITEM_GRANTS;
  if (!grants[options.command]) return false;
  if (options.table === "distribution_snapshots") {
    return snapshotPolicy(options.command, options.actor, SNAPSHOT, guc);
  }
  return itemPolicy(options.command, options.actor, ITEM, guc);
}

function simulateRpcWrite(actor: Actor): boolean {
  if (!actor.isAdmin) return false;
  if (!isSemesterPlanOwner(actor, PLAN_OWNER_ID)) return false;
  const guc = "approve_distribution_snapshot";
  return (
    postgrestAllowed({
      table: "distribution_snapshots",
      command: "update",
      actor,
      guc,
    }) &&
    postgrestAllowed({
      table: "distribution_snapshots",
      command: "insert",
      actor,
      guc,
    }) &&
    postgrestAllowed({
      table: "distribution_snapshot_items",
      command: "insert",
      actor,
      guc,
    })
  );
}

const ownerTeacher: Actor = { uid: OWNER, isAdmin: false };
const stranger: Actor = { uid: STRANGER, isAdmin: false };
const admin: Actor = { uid: ADMIN, isAdmin: true };

describe("P1-B SQL contract (not live PostgreSQL)", () => {
  const sql = readFileSync(MIGRATION, "utf8");
  const previous = readFileSync(PREVIOUS_RLS, "utf8");
  const atomic = readFileSync(ATOMIC_RPC, "utf8");
  const withoutComments = sql.replace(/--[^\n]*/g, "");

  it("keeps RLS enabled and does not weaken or remove it", () => {
    assert.match(sql, /alter table public\.distribution_snapshots enable row level security/);
    assert.match(sql, /alter table public\.distribution_snapshot_items enable row level security/);
    assert.doesNotMatch(sql, /disable row level security/i);
    assert.doesNotMatch(sql, /force row level security/i);
    assert.doesNotMatch(withoutComments, /using\s*\(\s*true\s*\)/i);
    assert.doesNotMatch(withoutComments, /with check\s*\(\s*true\s*\)/i);
    assert.doesNotMatch(withoutComments, /security definer/i);
    assert.doesNotMatch(withoutComments, /\bservice_role\b/);
  });

  it("preserves previous SELECT owner predicate and drops FOR ALL write policies", () => {
    assert.match(previous, /for all/i);
    assert.match(previous, /using \(public\.is_semester_plan_owner\(semester_plan_id\)\)/);
    assert.match(sql, /drop policy if exists "distribution_snapshots owner all"/);
    assert.match(sql, /drop policy if exists "distribution_snapshot_items owner all"/);
    assert.match(
      sql,
      /create policy "distribution_snapshots select owner"[\s\S]*for select[\s\S]*using \(public\.is_semester_plan_owner\(semester_plan_id\)\)/,
    );
    assert.match(sql, /create policy "distribution_snapshot_items select owner"[\s\S]*for select/);
    assert.doesNotMatch(withoutComments, /for all/i);
  });

  it("gates INSERT/UPDATE on admin + RPC GUC and has no DELETE policies", () => {
    assert.match(sql, /distribution_snapshot_rpc_is\('approve_distribution_snapshot'\)/);
    assert.match(sql, /has_role\(auth\.uid\(\), 'admin'::public\.app_role\)/);
    assert.match(sql, /create policy "distribution_snapshots insert rpc"/);
    assert.match(sql, /create policy "distribution_snapshots update rpc"/);
    assert.match(sql, /create policy "distribution_snapshot_items insert rpc"/);
    assert.doesNotMatch(sql, /create policy "distribution_snapshots delete/);
    assert.doesNotMatch(sql, /create policy "distribution_snapshot_items delete/);
    assert.doesNotMatch(sql, /create policy "distribution_snapshot_items update/);
  });

  it("revokes authenticated DELETE and does not grant new write privileges", () => {
    assert.match(sql, /revoke all on public\.distribution_snapshots from authenticated/);
    assert.match(sql, /revoke all on public\.distribution_snapshot_items from authenticated/);
    assert.match(
      sql,
      /grant select, insert, update on public\.distribution_snapshots to authenticated/,
    );
    assert.match(
      sql,
      /grant select, insert on public\.distribution_snapshot_items to authenticated/,
    );
    assert.doesNotMatch(
      withoutComments,
      /grant select, insert, update, delete on public\.distribution_snapshots to authenticated/,
    );
    assert.doesNotMatch(
      withoutComments,
      /grant select, insert, update, delete on public\.distribution_snapshot_items to authenticated/,
    );
  });

  it("keeps the approval RPC SECURITY INVOKER and sets the GUC after validation", () => {
    assert.match(sql, /security invoker/i);
    assert.match(atomic, /security invoker/i);
    const validateIdx = sql.indexOf("v_item_count < 1 or v_total_periods < 1");
    const gucIdx = sql.indexOf("set_config(\n    'app.distribution_snapshot_rpc'");
    const updateIdx = sql.indexOf("set is_current = false");
    assert.ok(validateIdx >= 0);
    assert.ok(gucIdx > validateIdx);
    assert.ok(updateIdx > gucIdx);
    assert.match(
      sql,
      /set_config\(\s*'app\.distribution_snapshot_rpc',\s*'approve_distribution_snapshot',\s*true\s*\)/,
    );
    assert.match(sql, /grant execute[\s\S]*to authenticated/i);
    assert.doesNotMatch(withoutComments, /planner_entries/);
    assert.doesNotMatch(withoutComments, /lesson_sessions/);
    assert.doesNotMatch(sql, /INSERT INTO public\.semester_plans/i);
  });
});

describe("P1-B in-memory RLS replica (not live PostgreSQL RLS)", () => {
  it("A. owner teacher direct SELECT snapshot -> allowed", () => {
    assert.equal(
      postgrestAllowed({ table: "distribution_snapshots", command: "select", actor: ownerTeacher }),
      true,
    );
  });

  it("B. owner teacher direct INSERT snapshot -> denied", () => {
    assert.equal(
      postgrestAllowed({ table: "distribution_snapshots", command: "insert", actor: ownerTeacher }),
      false,
    );
  });

  it("C. owner teacher direct UPDATE snapshot -> denied", () => {
    assert.equal(
      postgrestAllowed({ table: "distribution_snapshots", command: "update", actor: ownerTeacher }),
      false,
    );
  });

  it("D. owner teacher direct DELETE snapshot -> denied", () => {
    assert.equal(
      postgrestAllowed({ table: "distribution_snapshots", command: "delete", actor: ownerTeacher }),
      false,
    );
  });

  it("E. owner teacher direct INSERT item -> denied", () => {
    assert.equal(
      postgrestAllowed({
        table: "distribution_snapshot_items",
        command: "insert",
        actor: ownerTeacher,
      }),
      false,
    );
  });

  it("F. owner teacher direct UPDATE item -> denied", () => {
    assert.equal(
      postgrestAllowed({
        table: "distribution_snapshot_items",
        command: "update",
        actor: ownerTeacher,
      }),
      false,
    );
  });

  it("G. owner teacher direct DELETE item -> denied", () => {
    assert.equal(
      postgrestAllowed({
        table: "distribution_snapshot_items",
        command: "delete",
        actor: ownerTeacher,
      }),
      false,
    );
  });

  it("H. non-owner direct write -> denied", () => {
    for (const command of ["insert", "update", "delete"] as const) {
      assert.equal(
        postgrestAllowed({ table: "distribution_snapshots", command, actor: stranger }),
        false,
      );
      assert.equal(
        postgrestAllowed({ table: "distribution_snapshot_items", command, actor: stranger }),
        false,
      );
    }
  });

  it("I. admin direct table write -> denied", () => {
    for (const command of ["insert", "update", "delete"] as const) {
      assert.equal(
        postgrestAllowed({ table: "distribution_snapshots", command, actor: admin }),
        false,
      );
      assert.equal(
        postgrestAllowed({ table: "distribution_snapshot_items", command, actor: admin }),
        false,
      );
    }
  });

  it("J. authenticated admin approval through RPC -> allowed", () => {
    assert.equal(simulateRpcWrite(admin), true);
    assert.equal(simulateRpcWrite(ownerTeacher), false);
    assert.equal(simulateRpcWrite(stranger), false);
  });

  it("K. existing SELECT behavior preserved", () => {
    assert.equal(
      postgrestAllowed({ table: "distribution_snapshots", command: "select", actor: ownerTeacher }),
      true,
    );
    assert.equal(
      postgrestAllowed({
        table: "distribution_snapshot_items",
        command: "select",
        actor: ownerTeacher,
      }),
      true,
    );
    assert.equal(
      postgrestAllowed({ table: "distribution_snapshots", command: "select", actor: admin }),
      true,
    );
    assert.equal(
      postgrestAllowed({
        table: "distribution_snapshot_items",
        command: "select",
        actor: admin,
      }),
      true,
    );
    assert.equal(
      postgrestAllowed({ table: "distribution_snapshots", command: "select", actor: stranger }),
      false,
    );
    assert.equal(
      postgrestAllowed({
        table: "distribution_snapshot_items",
        command: "select",
        actor: stranger,
      }),
      false,
    );
  });
});
