CREATE TABLE IF NOT EXISTS users (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name varchar(120) NOT NULL CHECK (length(trim(name)) > 0),
  email varchar(254) NOT NULL UNIQUE CHECK (email = lower(email)),
  password text NOT NULL,
  role text NOT NULL DEFAULT 'User' CHECK (role IN ('Admin', 'User')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name varchar(160) NOT NULL CHECK (length(trim(name)) > 0),
  description text,
  created_by integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title varchar(200) NOT NULL CHECK (length(trim(title)) > 0),
  description text,
  project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  assigned_to integer REFERENCES users(id) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High')),
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Completed')),
  due_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS projects_creator_idx ON projects(created_by);
CREATE INDEX IF NOT EXISTS tasks_project_idx ON tasks(project_id);
CREATE INDEX IF NOT EXISTS tasks_assignee_project_idx ON tasks(assigned_to, project_id);

CREATE OR REPLACE FUNCTION update_task_timestamp() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION update_task_timestamp();
