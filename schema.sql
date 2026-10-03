-- Sharada English Medium School
-- Supabase / PostgreSQL Schema Definition

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(50) UNIQUE,
  password TEXT DEFAULT '',
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'teacher',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(50),
  qualification VARCHAR(255),
  designation VARCHAR(255),
  joining_date DATE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_no VARCHAR(100) UNIQUE NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  parent_name VARCHAR(255),
  parent_mobile VARCHAR(50) NOT NULL,
  parent_email VARCHAR(255),
  class_name VARCHAR(100) NOT NULL,
  section VARCHAR(50),
  roll_number INTEGER,
  academic_year VARCHAR(50) DEFAULT '2024-2025',
  status VARCHAR(50) DEFAULT 'Active',
  academic_history JSONB DEFAULT '[]'::jsonb,
  grade VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'Present',
  session_status VARCHAR(50) DEFAULT 'Full Day',
  attendance_type VARCHAR(50) DEFAULT 'Full Day',
  remarks TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_attendance_student_date UNIQUE (student_id, date)
);

CREATE TABLE IF NOT EXISTS public.marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
  subject_teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
  teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
  class_name VARCHAR(100) DEFAULT '',
  academic_year VARCHAR(50) DEFAULT '2024-2025',
  part VARCHAR(50) DEFAULT 'Part A',
  subject VARCHAR(100) NOT NULL,
  lecture_name VARCHAR(255) DEFAULT '',
  score NUMERIC(6, 2) NOT NULL,
  max_score NUMERIC(6, 2) DEFAULT 100,
  oral_score NUMERIC(6, 2) DEFAULT 0,
  converted_score NUMERIC(6, 2) DEFAULT 0,
  converted_max_score NUMERIC(6, 2) DEFAULT 15,
  exam_type VARCHAR(100) DEFAULT 'Unit Test',
  grade VARCHAR(50) DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_marks_student_subject_exam_year UNIQUE (student_id, subject, exam_type, academic_year)
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action VARCHAR(50) NOT NULL,
  entity VARCHAR(50) NOT NULL,
  record_id VARCHAR(255) NOT NULL,
  actor_name VARCHAR(255) DEFAULT '',
  actor_email VARCHAR(255) DEFAULT '',
  actor_role VARCHAR(50) DEFAULT '',
  values JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.otp_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  purpose VARCHAR(50) NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_phone ON public.users(phone);
CREATE INDEX IF NOT EXISTS idx_students_parent_mobile ON public.students(parent_mobile);
CREATE INDEX IF NOT EXISTS idx_students_class_name ON public.students(class_name);
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON public.attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance(date);
CREATE INDEX IF NOT EXISTS idx_marks_student_id ON public.marks(student_id);
CREATE INDEX IF NOT EXISTS idx_marks_academic_year ON public.marks(academic_year);
CREATE INDEX IF NOT EXISTS idx_otp_email_purpose ON public.otp_challenges(LOWER(email), purpose);
