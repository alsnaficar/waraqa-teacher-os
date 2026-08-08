-- W6: Atomic curriculum draft save
-- Server-only RPC. Admin authorization is checked before mutation.

create or replace function public.save_curriculum_draft_atomic(
  p_user_id uuid,
  p_file_id uuid,
  p_original_name text,
  p_academic_year text,
  p_semester text,
  p_grade text,
  p_subject text,
  p_lessons jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_file_id uuid;
begin
  -- Defense in depth:
  -- the caller must be an admin according to the canonical role table.
  if not public.has_role(p_user_id, 'admin'::public.app_role) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  -- Existing curriculum: only draft may be modified.
  if p_file_id is not null then
    select id
      into v_file_id
      from public.curriculum_files
     where id = p_file_id
       and status = 'draft'
     for update;

    if v_file_id is null then
      raise exception 'CURRICULUM_NOT_DRAFT';
    end if;

    update public.curriculum_files
       set subject = p_subject,
           grade = p_grade,
           semester = p_semester,
           academic_year = p_academic_year,
           updated_at = now()
     where id = v_file_id;

    delete from public.curriculum_lessons
     where curriculum_file_id = v_file_id;

  else
    -- New curriculum draft.
    insert into public.curriculum_files (
      original_name,
      subject,
      grade,
      semester,
      academic_year,
      status,
      mime_type,
      size_bytes,
      storage_path,
      user_id
    )
    values (
      p_original_name,
      p_subject,
      p_grade,
      p_semester,
      p_academic_year,
      'draft',
      'application/pdf',
      0,
      'admin_upload',
      p_user_id
    )
    returning id into v_file_id;
  end if;

  -- Insert all lessons as part of the same transaction.
  insert into public.curriculum_lessons (
    curriculum_file_id,
    title,
    objectives,
    notes,
    order_index,
    user_id
  )
  select
    v_file_id,
    coalesce(x->>'lessonTitle', ''),
    coalesce(x->>'objectives', ''),
    jsonb_build_object(
      'unitNumber', coalesce(x->>'unitNumber', ''),
      'unitName', coalesce(x->>'unitName', ''),
      'lessonNumber', coalesce(x->>'lessonNumber', ''),
      'outcomes', coalesce(x->>'outcomes', ''),
      'activities', coalesce(x->>'activities', ''),
      'assessment', coalesce(x->>'assessment', ''),
      'periods', coalesce(x->>'periods', '1'),
      'notes', coalesce(x->>'notes', '')
    )::text,
    ordinality - 1,
    p_user_id
  from jsonb_array_elements(coalesce(p_lessons, '[]'::jsonb))
       with ordinality as t(x, ordinality);

  return v_file_id;
end;
$$;

revoke all on function public.save_curriculum_draft_atomic(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb
) from public, anon, authenticated;

grant execute on function public.save_curriculum_draft_atomic(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb
) to service_role;
