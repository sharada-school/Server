const { Pool } = require('pg');

let connectionString = process.env.DATABASE_URL || '';

// Safely handle special characters like '@' in database password
if (connectionString) {
  const protocolEnd = connectionString.indexOf('://');
  if (protocolEnd !== -1) {
    const protocol = connectionString.slice(0, protocolEnd + 3);
    const rest = connectionString.slice(protocolEnd + 3);
    const lastAt = rest.lastIndexOf('@');
    if (lastAt !== -1) {
      const userInfo = rest.slice(0, lastAt);
      const hostPart = rest.slice(lastAt + 1);
      const firstColon = userInfo.indexOf(':');
      if (firstColon !== -1) {
        const user = userInfo.slice(0, firstColon);
        const pass = userInfo.slice(firstColon + 1);
        connectionString = `${protocol}${user}:${encodeURIComponent(decodeURIComponent(pass))}@${hostPart}`;
      }
    }
  }
}

const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

const pool = new Pool(
  connectionString
    ? {
        connectionString,
        connectionTimeoutMillis: 10000,
        ssl: isLocal ? false : { rejectUnauthorized: false }
      }
    : {
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'postgres',
        database: process.env.PGDATABASE || 'sharada_school',
        connectionTimeoutMillis: 10000,
        ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false
      }
);

pool.on('error', (err) => {
  console.error('⚠️ Unexpected error on idle PostgreSQL client:', err.message);
});

// Map database snake_case to JavaScript camelCase
const toCamelCase = (row) => {
  if (!row || typeof row !== 'object') return row;
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    const camelKey = key.replace(/_([a-z])/g, (_, g) => g.toUpperCase());
    result[camelKey] = value;
  }
  if (result.id && !result._id) {
    result._id = result.id;
  }
  return result;
};

const normalizeDocument = (doc) => {
  if (Array.isArray(doc)) return doc.map(normalizeDocument);
  if (!doc) return doc;
  const normalized = typeof doc.toJSON === 'function' ? doc.toJSON() : { ...doc };
  if (normalized.id && !normalized._id) normalized._id = normalized.id;
  if (normalized._id && !normalized.id) normalized.id = String(normalized._id);
  return normalized;
};

// Chainable Query Helper mimicking Mongoose query chaining (.sort, .limit, .populate, .lean)
class QueryPromise {
  constructor(executor) {
    this._executor = executor;
    this._sort = null;
    this._limit = null;
    this._populates = [];
  }

  sort(sortObj) {
    this._sort = sortObj;
    return this;
  }

  limit(n) {
    this._limit = n;
    return this;
  }

  populate(field, select) {
    this._populates.push({ field, select });
    return this;
  }

  lean() {
    return this;
  }

  then(resolve, reject) {
    return this._executor(this._sort, this._limit, this._populates).then(resolve, reject);
  }

  catch(reject) {
    return this.then(null, reject);
  }
}

// -------------------------------------------------------------
// Database Schema Initialization
// -------------------------------------------------------------
const initTables = async () => {
  console.log('🔄 Connecting to PostgreSQL database to initialize tables...');
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO public;`);
    try {
      await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);
    } catch {
      // pgcrypto may already be enabled or restricted by cloud host
    }

    await client.query(`
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
    `);
    console.log('✅ PostgreSQL tables and indexes initialized successfully.');
  } finally {
    client.release();
  }
};

const connectPostgres = async () => {
  await initTables();
  console.log(`✅ Connected to PostgreSQL database successfully.`);
};

// -------------------------------------------------------------
// Model Implementations for PostgreSQL
// -------------------------------------------------------------

// USERS
const User = {
  find(filter = {}) {
    return new QueryPromise(async (sort, limit) => {
      let query = 'SELECT * FROM public.users WHERE 1=1';
      const params = [];
      if (filter.role) {
        params.push(filter.role);
        query += ` AND role = $${params.length}`;
      }
      if (sort?.createdAt === -1) {
        query += ' ORDER BY created_at DESC';
      } else {
        query += ' ORDER BY created_at ASC';
      }
      if (limit) {
        query += ` LIMIT ${parseInt(limit, 10)}`;
      }
      const res = await pool.query(query, params);
      return res.rows.map(toCamelCase);
    });
  },

  findOne(filter = {}) {
    return new QueryPromise(async () => {
      let query = 'SELECT * FROM public.users WHERE 1=1';
      const params = [];
      if (filter.email) {
        const cleanEmail = String(filter.email).toLowerCase().trim().replace(/^["']|["']$/g, '');
        params.push(cleanEmail);
        query += ` AND (LOWER(TRIM(REPLACE(email, '"', ''))) = $${params.length} OR LOWER(TRIM(email)) = $${params.length})`;
      }
      if (filter.phone) {
        const cleanPhone = String(filter.phone).trim().replace(/^["']|["']$/g, '');
        params.push(cleanPhone);
        query += ` AND (TRIM(REPLACE(phone, '"', '')) = $${params.length} OR phone = $${params.length})`;
      }
      if (filter.role) {
        params.push(filter.role);
        query += ` AND role = $${params.length}`;
      }
      if (filter.id || filter._id) {
        params.push(filter.id || filter._id);
        query += ` AND id = $${params.length}`;
      }
      query += ' LIMIT 1';

      const res = await pool.query(query, params);
      if (!res.rows[0]) return null;
      const user = toCamelCase(res.rows[0]);
      if (user.password) {
        user.password = String(user.password).trim().replace(/^["']|["']$/g, '');
      }
      if (user.email) {
        user.email = String(user.email).trim().toLowerCase().replace(/^["']|["']$/g, '');
      }
      user.save = async function () {
        await User.updateOne({ id: this.id }, { name: this.name, role: this.role });
        return this;
      };
      user.lean = () => user;
      return user;
    });
  },

  async exists(filter = {}) {
    const user = await this.findOne(filter);
    return !!user;
  },

  async create(data) {
    const email = data.email ? String(data.email).toLowerCase().trim().replace(/^["']|["']$/g, '') : null;
    const phone = data.phone ? String(data.phone).trim().replace(/^["']|["']$/g, '') : null;
    const name = String(data.name || '').trim().replace(/^["']|["']$/g, '');
    const password = String(data.password || '').trim().replace(/^["']|["']$/g, '');
    const role = data.role || 'teacher';

    const res = await pool.query(
      `INSERT INTO public.users (email, phone, name, password, role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE
       SET name = EXCLUDED.name,
           password = EXCLUDED.password,
           role = EXCLUDED.role
       RETURNING *`,
      [email, phone, name, password, role]
    );
    const user = toCamelCase(res.rows[0]);
    if (user.password) {
      user.password = String(user.password).trim().replace(/^["']|["']$/g, '');
    }
    user.lean = () => user;
    return user;
  },

  async updateOne(filter = {}, updateData = {}) {
    const user = await this.findOne(filter);
    if (!user) return null;

    const updates = [];
    const params = [];
    const fields = {
      name: updateData.name ? String(updateData.name).trim().replace(/^["']|["']$/g, '') : undefined,
      password: updateData.password ? String(updateData.password).trim().replace(/^["']|["']$/g, '') : undefined,
      role: updateData.role,
      phone: updateData.phone ? String(updateData.phone).trim().replace(/^["']|["']$/g, '') : undefined,
      email: updateData.email ? String(updateData.email).toLowerCase().trim().replace(/^["']|["']$/g, '') : undefined
    };

    for (const [key, val] of Object.entries(fields)) {
      if (val !== undefined) {
        params.push(val);
        updates.push(`${key} = $${params.length}`);
      }
    }

    if (updates.length > 0) {
      params.push(user.id);
      await pool.query(`UPDATE public.users SET ${updates.join(', ')} WHERE id = $${params.length}`, params);
    }
    return true;
  },

  async findOneAndUpdate(filter = {}, updateData = {}, options = {}) {
    let user = await this.findOne(filter);
    if (!user && options.upsert) {
      return this.create({ ...filter, ...updateData });
    }
    if (user) {
      await this.updateOne(filter, updateData);
      return this.findOne(filter);
    }
    return null;
  }
};

// TEACHERS
const Teacher = {
  find(filter = {}) {
    return new QueryPromise(async (sort) => {
      let query = 'SELECT * FROM public.teachers';
      if (sort?.name) {
        query += sort.name === -1 ? ' ORDER BY name DESC' : ' ORDER BY name ASC';
      } else {
        query += ' ORDER BY name ASC';
      }
      const res = await pool.query(query);
      return res.rows.map(toCamelCase);
    });
  },

  async findById(id) {
    if (!id) return null;
    const res = await pool.query('SELECT * FROM public.teachers WHERE id = $1 LIMIT 1', [id]);
    return res.rows[0] ? toCamelCase(res.rows[0]) : null;
  },

  async create(data) {
    const res = await pool.query(
      `INSERT INTO public.teachers (name, email, phone, qualification, designation, joining_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data.name,
        data.email ? String(data.email).toLowerCase().trim() : null,
        data.phone || null,
        data.qualification || '',
        data.designation || '',
        data.joiningDate || data.joining_date || null
      ]
    );
    return toCamelCase(res.rows[0]);
  },

  async findByIdAndUpdate(id, data) {
    const res = await pool.query(
      `UPDATE public.teachers
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           phone = COALESCE($3, phone),
           qualification = COALESCE($4, qualification),
           designation = COALESCE($5, designation)
       WHERE id = $6
       RETURNING *`,
      [
        data.name,
        data.email ? String(data.email).toLowerCase().trim() : undefined,
        data.phone,
        data.qualification,
        data.designation,
        id
      ]
    );
    return res.rows[0] ? toCamelCase(res.rows[0]) : null;
  },

  async findByIdAndDelete(id) {
    const res = await pool.query('DELETE FROM public.teachers WHERE id = $1 RETURNING *', [id]);
    return res.rows[0] ? toCamelCase(res.rows[0]) : null;
  },

  async findOneAndUpdate(filter = {}, data = {}, options = {}) {
    let existing = null;
    if (filter.email) {
      const res = await pool.query('SELECT * FROM public.teachers WHERE LOWER(email) = LOWER($1) LIMIT 1', [filter.email]);
      existing = res.rows[0] ? toCamelCase(res.rows[0]) : null;
    }
    if (!existing && options.upsert) {
      return this.create({ ...filter, ...data });
    }
    if (existing) {
      return this.findByIdAndUpdate(existing.id, data);
    }
    return null;
  },

  async countDocuments() {
    const res = await pool.query('SELECT COUNT(*) AS count FROM public.teachers');
    return parseInt(res.rows[0].count, 10);
  }
};

// STUDENTS
const Student = {
  find(filter = {}) {
    return new QueryPromise(async (sort, limit) => {
      let query = 'SELECT * FROM public.students WHERE 1=1';
      const params = [];

      if (filter.parentMobile) {
        params.push(`%${String(filter.parentMobile).replace(/\D/g, '').slice(-10)}`);
        query += ` AND parent_mobile LIKE $${params.length}`;
      } else if (filter.$or && filter.$or.some(c => c.parentMobile)) {
        const item = filter.$or.find(c => c.parentMobile);
        const val = typeof item.parentMobile === 'string'
          ? item.parentMobile.replace(/\D/g, '').slice(-10)
          : String(item.parentMobile?.$regex || '').replace(/\D/g, '').slice(-10);
        if (val) {
          params.push(`%${val}`);
          query += ` AND parent_mobile LIKE $${params.length}`;
        }
      }

      if (filter.status?.$ne) {
        params.push(filter.status.$ne);
        query += ` AND status != $${params.length}`;
      }

      if (filter.academicYear?.$ne) {
        params.push(filter.academicYear.$ne);
        query += ` AND academic_year != $${params.length}`;
      }

      if (filter.className) {
        params.push(filter.className);
        query += ` AND class_name = $${params.length}`;
      }

      if (filter._id?.$in || filter.id?.$in) {
        const ids = filter._id?.$in || filter.id?.$in;
        params.push(ids);
        query += ` AND id = ANY($${params.length})`;
      }

      if (filter.admissionNo?.$in) {
        params.push(filter.admissionNo.$in);
        query += ` AND admission_no = ANY($${params.length})`;
      }

      if (sort) {
        const orderParts = [];
        if (sort.rollNumber !== undefined) orderParts.push(`roll_number ${sort.rollNumber === -1 ? 'DESC' : 'ASC'}`);
        if (sort.firstName !== undefined) orderParts.push(`first_name ${sort.firstName === -1 ? 'DESC' : 'ASC'}`);
        if (sort.createdAt !== undefined) orderParts.push(`created_at ${sort.createdAt === -1 ? 'DESC' : 'ASC'}`);
        if (orderParts.length > 0) query += ` ORDER BY ${orderParts.join(', ')}`;
      } else {
        query += ' ORDER BY roll_number ASC, first_name ASC';
      }

      if (limit) {
        query += ` LIMIT ${parseInt(limit, 10)}`;
      }

      const res = await pool.query(query, params);
      return res.rows.map(toCamelCase);
    });
  },

  async findById(id) {
    if (!id) return null;
    const res = await pool.query('SELECT * FROM public.students WHERE id = $1 LIMIT 1', [id]);
    return res.rows[0] ? toCamelCase(res.rows[0]) : null;
  },

  async create(data) {
    const res = await pool.query(
      `INSERT INTO public.students (
        admission_no, first_name, last_name, email, phone,
        parent_name, parent_mobile, parent_email, class_name, section,
        roll_number, academic_year, status, academic_history, grade
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        data.admissionNo || data.admission_no,
        data.firstName || data.first_name,
        data.lastName || data.last_name,
        data.email || null,
        data.phone || null,
        data.parentName || data.parent_name || '',
        data.parentMobile || data.parent_mobile,
        data.parentEmail || data.parent_email || '',
        data.className || data.class_name,
        data.section || '',
        data.rollNumber !== undefined ? Number(data.rollNumber) : null,
        data.academicYear || data.academic_year || '2024-2025',
        data.status || 'Active',
        JSON.stringify(data.academicHistory || data.academic_history || []),
        data.grade || ''
      ]
    );
    return toCamelCase(res.rows[0]);
  },

  async findByIdAndUpdate(id, data) {
    const current = await this.findById(id);
    if (!current) return null;

    const res = await pool.query(
      `UPDATE public.students
       SET first_name = COALESCE($1, first_name),
           last_name = COALESCE($2, last_name),
           class_name = COALESCE($3, class_name),
           section = COALESCE($4, section),
           roll_number = COALESCE($5, roll_number),
           academic_year = COALESCE($6, academic_year),
           status = COALESCE($7, status),
           parent_name = COALESCE($8, parent_name),
           parent_mobile = COALESCE($9, parent_mobile),
           parent_email = COALESCE($10, parent_email),
           grade = COALESCE($11, grade),
           academic_history = COALESCE($12, academic_history)
       WHERE id = $13
       RETURNING *`,
      [
        data.firstName || data.first_name,
        data.lastName || data.last_name,
        data.className || data.class_name,
        data.section,
        data.rollNumber !== undefined ? Number(data.rollNumber) : undefined,
        data.academicYear || data.academic_year,
        data.status,
        data.parentName || data.parent_name,
        data.parentMobile || data.parent_mobile,
        data.parentEmail || data.parent_email,
        data.grade,
        data.academicHistory ? JSON.stringify(data.academicHistory) : undefined,
        id
      ]
    );
    return res.rows[0] ? toCamelCase(res.rows[0]) : null;
  },

  async findOneAndUpdate(filter = {}, data = {}, options = {}) {
    let existing = null;
    if (filter.admissionNo) {
      const res = await pool.query('SELECT * FROM public.students WHERE admission_no = $1 LIMIT 1', [filter.admissionNo]);
      existing = res.rows[0] ? toCamelCase(res.rows[0]) : null;
    }
    if (!existing && options.upsert) {
      return this.create({ ...filter, ...data });
    }
    if (existing) {
      return this.findByIdAndUpdate(existing.id, data);
    }
    return null;
  },

  async updateMany(filter = {}, updateData = {}) {
    if (filter.admissionNo?.$in) {
      const set = updateData.$set || updateData;
      const values = [];
      const clauses = [];
      if (set.parentMobile) {
        values.push(set.parentMobile);
        clauses.push(`parent_mobile = $${values.length}`);
      }
      if (set.parentName) {
        values.push(set.parentName);
        clauses.push(`parent_name = $${values.length}`);
      }
      if (clauses.length > 0) {
        values.push(filter.admissionNo.$in);
        await pool.query(`UPDATE public.students SET ${clauses.join(', ')} WHERE admission_no = ANY($${values.length})`, values);
      }
    }
    return true;
  },

  async updateOne(filter = {}, updateData = {}) {
    const id = filter._id || filter.id;
    const set = updateData.$set || updateData;
    if (id) {
      return this.findByIdAndUpdate(id, set);
    }
    return true;
  },

  async countDocuments(filter = {}) {
    const list = await this.find(filter);
    return list.length;
  }
};

// ATTENDANCE
const Attendance = {
  find(filter = {}) {
    return new QueryPromise(async (sort, limit, populates) => {
      let query = 'SELECT * FROM public.attendance WHERE 1=1';
      const params = [];

      if (filter.studentId) {
        params.push(filter.studentId);
        query += ` AND student_id = $${params.length}`;
      }

      if (filter.date?.$gte) {
        params.push(filter.date.$gte);
        query += ` AND date >= $${params.length}`;
      }

      if (sort?.date) {
        query += sort.date === -1 ? ' ORDER BY date DESC' : ' ORDER BY date ASC';
      } else {
        query += ' ORDER BY date DESC';
      }

      if (limit) {
        query += ` LIMIT ${parseInt(limit, 10)}`;
      }

      const res = await pool.query(query, params);
      const rows = res.rows.map(toCamelCase);

      if (populates.some(p => p.field === 'studentId')) {
        const studentIds = [...new Set(rows.map(r => r.studentId).filter(Boolean))];
        if (studentIds.length > 0) {
          const studentsRes = await pool.query('SELECT * FROM public.students WHERE id = ANY($1)', [studentIds]);
          const studentMap = new Map(studentsRes.rows.map(toCamelCase).map(s => [s.id, s]));
          for (const row of rows) {
            row.studentId = studentMap.get(row.studentId) || row.studentId;
          }
        }
      }

      return rows;
    });
  },

  findOne(filter = {}) {
    return new QueryPromise(async (sort) => {
      const list = await Attendance.find(filter).sort(sort).limit(1);
      return list[0] || null;
    });
  },

  async create(data) {
    const res = await pool.query(
      `INSERT INTO public.attendance (student_id, date, status, session_status, attendance_type, remarks)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data.studentId,
        data.date,
        data.status || 'Present',
        data.sessionStatus || 'Full Day',
        data.attendanceType || 'Full Day',
        data.remarks || ''
      ]
    );
    return toCamelCase(res.rows[0]);
  },

  async findOneAndUpdate(filter = {}, data = {}, options = {}) {
    const studentId = filter.studentId;
    const date = filter.date;

    const res = await pool.query(
      `INSERT INTO public.attendance (student_id, date, status, session_status, attendance_type, remarks)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (student_id, date) DO UPDATE
       SET status = EXCLUDED.status,
           session_status = EXCLUDED.session_status,
           attendance_type = EXCLUDED.attendance_type,
           remarks = EXCLUDED.remarks
       RETURNING *`,
      [
        studentId,
        date,
        data.status || 'Present',
        data.sessionStatus || 'Full Day',
        data.attendanceType || 'Full Day',
        data.remarks || ''
      ]
    );
    return toCamelCase(res.rows[0]);
  },

  async findByIdAndUpdate(id, data) {
    const res = await pool.query(
      `UPDATE public.attendance
       SET student_id = COALESCE($1, student_id),
           date = COALESCE($2, date),
           status = COALESCE($3, status),
           session_status = COALESCE($4, session_status),
           attendance_type = COALESCE($5, attendance_type),
           remarks = COALESCE($6, remarks)
       WHERE id = $7
       RETURNING *`,
      [data.studentId, data.date, data.status, data.sessionStatus, data.attendanceType, data.remarks, id]
    );
    return res.rows[0] ? toCamelCase(res.rows[0]) : null;
  },

  async findByIdAndDelete(id) {
    const res = await pool.query('DELETE FROM public.attendance WHERE id = $1 RETURNING *', [id]);
    return res.rows[0] ? toCamelCase(res.rows[0]) : null;
  },

  async countDocuments(filter = {}) {
    let query = 'SELECT COUNT(*) AS count FROM public.attendance WHERE 1=1';
    const params = [];

    if (filter.studentId) {
      params.push(filter.studentId);
      query += ` AND student_id = $${params.length}`;
    }

    if (filter.status?.$in) {
      params.push(filter.status.$in);
      query += ` AND status = ANY($${params.length})`;
    }

    const res = await pool.query(query, params);
    return parseInt(res.rows[0].count, 10);
  }
};

// MARKS
const Mark = {
  find(filter = {}) {
    return new QueryPromise(async (sort, limit, populates) => {
      let query = 'SELECT * FROM public.marks WHERE 1=1';
      const params = [];

      if (filter.studentId) {
        params.push(filter.studentId);
        query += ` AND student_id = $${params.length}`;
      }

      if (filter.className) {
        params.push(filter.className);
        query += ` AND class_name = $${params.length}`;
      }

      if (filter.academicYear) {
        params.push(filter.academicYear);
        query += ` AND academic_year = $${params.length}`;
      }

      if (filter.$or) {
        query += ' AND (academic_year IS NULL OR academic_year = \'\')';
      }

      if (sort?.createdAt) {
        query += sort.createdAt === -1 ? ' ORDER BY created_at DESC' : ' ORDER BY created_at ASC';
      } else {
        query += ' ORDER BY created_at DESC';
      }

      const res = await pool.query(query, params);
      const rows = res.rows.map(toCamelCase);

      // Handle populates
      const shouldPopulateStudents = populates.some(p => p.field === 'studentId');
      const shouldPopulateTeachers = populates.some(p => ['teacherId', 'classTeacherId', 'subjectTeacherId'].includes(p.field));

      if (shouldPopulateStudents) {
        const studentIds = [...new Set(rows.map(r => r.studentId).filter(Boolean))];
        if (studentIds.length > 0) {
          const sRes = await pool.query('SELECT * FROM public.students WHERE id = ANY($1)', [studentIds]);
          const sMap = new Map(sRes.rows.map(toCamelCase).map(s => [s.id, s]));
          for (const row of rows) {
            row.studentId = sMap.get(row.studentId) || row.studentId;
          }
        }
      }

      if (shouldPopulateTeachers) {
        const tIds = [...new Set([
          ...rows.map(r => r.teacherId),
          ...rows.map(r => r.classTeacherId),
          ...rows.map(r => r.subjectTeacherId)
        ].filter(Boolean))];
        if (tIds.length > 0) {
          const tRes = await pool.query('SELECT id, name, designation FROM public.teachers WHERE id = ANY($1)', [tIds]);
          const tMap = new Map(tRes.rows.map(toCamelCase).map(t => [t.id, t]));
          for (const row of rows) {
            if (row.teacherId) row.teacherId = tMap.get(row.teacherId) || row.teacherId;
            if (row.classTeacherId) row.classTeacherId = tMap.get(row.classTeacherId) || row.classTeacherId;
            if (row.subjectTeacherId) row.subjectTeacherId = tMap.get(row.subjectTeacherId) || row.subjectTeacherId;
          }
        }
      }

      return rows;
    });
  },

  findById(id) {
    return new QueryPromise(async (_, __, populates) => {
      const res = await pool.query('SELECT * FROM public.marks WHERE id = $1 LIMIT 1', [id]);
      if (!res.rows[0]) return null;
      const mark = toCamelCase(res.rows[0]);

      if (populates.some(p => p.field === 'studentId') && mark.studentId) {
        const sRes = await pool.query('SELECT * FROM public.students WHERE id = $1 LIMIT 1', [mark.studentId]);
        if (sRes.rows[0]) mark.studentId = toCamelCase(sRes.rows[0]);
      }
      if (populates.some(p => p.field === 'classTeacherId') && mark.classTeacherId) {
        const tRes = await pool.query('SELECT id, name FROM public.teachers WHERE id = $1 LIMIT 1', [mark.classTeacherId]);
        if (tRes.rows[0]) mark.classTeacherId = toCamelCase(tRes.rows[0]);
      }
      if (populates.some(p => p.field === 'subjectTeacherId') && mark.subjectTeacherId) {
        const tRes = await pool.query('SELECT id, name FROM public.teachers WHERE id = $1 LIMIT 1', [mark.subjectTeacherId]);
        if (tRes.rows[0]) mark.subjectTeacherId = toCamelCase(tRes.rows[0]);
      }
      if (populates.some(p => p.field === 'teacherId') && mark.teacherId) {
        const tRes = await pool.query('SELECT id, name FROM public.teachers WHERE id = $1 LIMIT 1', [mark.teacherId]);
        if (tRes.rows[0]) mark.teacherId = toCamelCase(tRes.rows[0]);
      }

      return mark;
    });
  },

  async create(data) {
    const res = await pool.query(
      `INSERT INTO public.marks (
        student_id, class_teacher_id, subject_teacher_id, teacher_id,
        class_name, academic_year, part, subject, lecture_name,
        score, max_score, oral_score, converted_score, converted_max_score,
        exam_type, grade
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        data.studentId,
        data.classTeacherId || null,
        data.subjectTeacherId || null,
        data.teacherId || null,
        data.className || '',
        data.academicYear || '2024-2025',
        data.part || 'Part A',
        data.subject,
        data.lectureName || '',
        data.score || 0,
        data.maxScore || 100,
        data.oralScore || 0,
        data.convertedScore || 0,
        data.convertedMaxScore || 15,
        data.examType || 'Unit Test',
        data.grade || ''
      ]
    );
    return toCamelCase(res.rows[0]);
  },

  async findOneAndUpdate(filter = {}, data = {}, options = {}) {
    const studentId = filter.studentId;
    const subject = filter.subject;
    const examType = filter.examType;
    const academicYear = filter.academicYear || data.academicYear || '2024-2025';

    const res = await pool.query(
      `INSERT INTO public.marks (
        student_id, class_teacher_id, subject_teacher_id, teacher_id,
        class_name, academic_year, part, subject, lecture_name,
        score, max_score, oral_score, converted_score, converted_max_score,
        exam_type, grade
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (student_id, subject, exam_type, academic_year) DO UPDATE
      SET score = EXCLUDED.score,
          max_score = EXCLUDED.max_score,
          oral_score = EXCLUDED.oral_score,
          converted_score = EXCLUDED.converted_score,
          converted_max_score = EXCLUDED.converted_max_score,
          grade = EXCLUDED.grade,
          class_name = EXCLUDED.class_name,
          class_teacher_id = COALESCE(EXCLUDED.class_teacher_id, marks.class_teacher_id),
          subject_teacher_id = COALESCE(EXCLUDED.subject_teacher_id, marks.subject_teacher_id),
          teacher_id = COALESCE(EXCLUDED.teacher_id, marks.teacher_id)
      RETURNING *`,
      [
        studentId,
        data.classTeacherId || null,
        data.subjectTeacherId || null,
        data.teacherId || null,
        data.className || '',
        academicYear,
        data.part || 'Part A',
        subject,
        data.lectureName || '',
        data.score || 0,
        data.maxScore || 100,
        data.oralScore || 0,
        data.convertedScore || 0,
        data.convertedMaxScore || 15,
        examType,
        data.grade || ''
      ]
    );
    return toCamelCase(res.rows[0]);
  },

  findByIdAndUpdate(id, data) {
    return new QueryPromise(async (_, __, populates) => {
      const res = await pool.query(
        `UPDATE public.marks
         SET student_id = COALESCE($1, student_id),
             class_teacher_id = COALESCE($2, class_teacher_id),
             subject_teacher_id = COALESCE($3, subject_teacher_id),
             teacher_id = COALESCE($4, teacher_id),
             class_name = COALESCE($5, class_name),
             academic_year = COALESCE($6, academic_year),
             part = COALESCE($7, part),
             subject = COALESCE($8, subject),
             score = COALESCE($9, score),
             max_score = COALESCE($10, max_score),
             oral_score = COALESCE($11, oral_score),
             converted_score = COALESCE($12, converted_score),
             converted_max_score = COALESCE($13, converted_max_score),
             exam_type = COALESCE($14, exam_type),
             grade = COALESCE($15, grade)
         WHERE id = $16
         RETURNING *`,
        [
          data.studentId,
          data.classTeacherId,
          data.subjectTeacherId,
          data.teacherId,
          data.className,
          data.academicYear,
          data.part,
          data.subject,
          data.score,
          data.maxScore,
          data.oralScore,
          data.convertedScore,
          data.convertedMaxScore,
          data.examType,
          data.grade,
          id
        ]
      );
      if (!res.rows[0]) return null;
      return Mark.findById(id).populate(populates.map(p => p.field));
    });
  },

  async findByIdAndDelete(id) {
    const res = await pool.query('DELETE FROM public.marks WHERE id = $1 RETURNING *', [id]);
    return res.rows[0] ? toCamelCase(res.rows[0]) : null;
  },

  async updateMany(filter = {}, updateData = {}) {
    const set = updateData.$set || updateData;
    const studentId = filter.studentId;
    if (studentId) {
      const updates = [];
      const params = [studentId];
      if (set.academicYear) {
        params.push(set.academicYear);
        updates.push(`academic_year = $${params.length}`);
      }
      if (set.className) {
        params.push(set.className);
        updates.push(`class_name = $${params.length}`);
      }
      if (updates.length > 0) {
        await pool.query(`UPDATE public.marks SET ${updates.join(', ')} WHERE student_id = $1`, params);
      }
    }
    return true;
  },

  async updateOne(filter = {}, updateData = {}) {
    const id = filter._id || filter.id;
    const set = updateData.$set || updateData;
    if (id) {
      const updates = [];
      const params = [];
      if (set.academicYear !== undefined) {
        params.push(set.academicYear);
        updates.push(`academic_year = $${params.length}`);
      }
      if (set.className !== undefined) {
        params.push(set.className);
        updates.push(`class_name = $${params.length}`);
      }
      if (set.score !== undefined) {
        params.push(set.score);
        updates.push(`score = $${params.length}`);
      }
      if (set.grade !== undefined) {
        params.push(set.grade);
        updates.push(`grade = $${params.length}`);
      }
      if (updates.length > 0) {
        params.push(id);
        await pool.query(`UPDATE public.marks SET ${updates.join(', ')} WHERE id = $${params.length}`, params);
      }
    }
    return true;
  },

  async countDocuments(filter = {}) {
    let query = 'SELECT COUNT(*) AS count FROM public.marks WHERE 1=1';
    const params = [];
    if (filter.studentId) {
      params.push(filter.studentId);
      query += ` AND student_id = $${params.length}`;
    }
    const res = await pool.query(query, params);
    return parseInt(res.rows[0].count, 10);
  }
};

// AUDIT LOGS
const AuditLog = {
  find() {
    return new QueryPromise(async (sort) => {
      let query = 'SELECT * FROM public.audit_logs';
      if (sort?.createdAt === -1) {
        query += ' ORDER BY created_at DESC';
      }
      const res = await pool.query(query);
      return res.rows.map(toCamelCase);
    });
  },

  async create(data) {
    const res = await pool.query(
      `INSERT INTO public.audit_logs (action, entity, record_id, actor_name, actor_email, actor_role, values)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        data.action,
        data.entity,
        data.recordId || data.record_id || '',
        data.actorName || data.actor_name || '',
        data.actorEmail || data.actor_email || '',
        data.actorRole || data.actor_role || '',
        JSON.stringify(data.values || {})
      ]
    );
    return toCamelCase(res.rows[0]);
  }
};

// OTP CHALLENGES
const OtpChallenge = {
  async deleteMany(filter = {}) {
    let query = 'DELETE FROM public.otp_challenges WHERE 1=1';
    const params = [];
    if (filter.email) {
      params.push(String(filter.email).toLowerCase().trim());
      query += ` AND LOWER(email) = $${params.length}`;
    }
    if (filter.purpose) {
      params.push(filter.purpose);
      query += ` AND purpose = $${params.length}`;
    }
    await pool.query(query, params);
  },

  async create(data) {
    const res = await pool.query(
      `INSERT INTO public.otp_challenges (email, purpose, code_hash, payload, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        String(data.email).toLowerCase().trim(),
        data.purpose,
        data.codeHash || data.code_hash,
        JSON.stringify(data.payload || {}),
        data.expiresAt || data.expires_at
      ]
    );
    return toCamelCase(res.rows[0]);
  },

  async findOne(filter = {}) {
    let query = 'SELECT * FROM public.otp_challenges WHERE 1=1';
    const params = [];
    if (filter.email) {
      params.push(String(filter.email).toLowerCase().trim());
      query += ` AND LOWER(email) = $${params.length}`;
    }
    if (filter.purpose) {
      params.push(filter.purpose);
      query += ` AND purpose = $${params.length}`;
    }
    query += ' ORDER BY created_at DESC LIMIT 1';

    const res = await pool.query(query, params);
    return res.rows[0] ? toCamelCase(res.rows[0]) : null;
  },

  async updateOne(filter = {}, updateData = {}) {
    if (filter._id || filter.id) {
      const id = filter._id || filter.id;
      if (updateData.$inc?.attempts) {
        await pool.query('UPDATE public.otp_challenges SET attempts = attempts + $1 WHERE id = $2', [updateData.$inc.attempts, id]);
      }
    }
  },

  async deleteOne(filter = {}) {
    if (filter._id || filter.id) {
      await pool.query('DELETE FROM public.otp_challenges WHERE id = $1', [filter._id || filter.id]);
    }
  }
};

module.exports = {
  pool,
  connectPostgres,
  connectMongo: connectPostgres, // Backward compatibility alias
  User,
  Student,
  Teacher,
  Attendance,
  Mark,
  AuditLog,
  OtpChallenge,
  normalizeDocument
};
