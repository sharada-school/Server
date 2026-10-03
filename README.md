# Sharada School Admin & Portal - Backend Server

Express API & PostgreSQL backend for the Sharada School Portal.

## Running the Server

1. **Install dependencies** (inside `Web/server`):
   ```bash
   npm install
   ```

2. **Run Backend (Development)**:
   ```bash
   npm run dev
   ```
   Server will run at `http://localhost:4000` with hot-reloading via `nodemon`.

3. **Run Backend (Production)**:
   ```bash
   npm start
   ```

4. **Seed Database**:
   ```bash
   npm run seed
   # or
   npm run db:seed
   ```

## Running the Frontend Client Separately

In a separate terminal, navigate to `Web/client`:
```bash
cd ../client
npm install
npm run dev
```
Client will run at `http://localhost:5173` and proxy requests to `http://localhost:4000`.

## Default Admin Credentials
- Email: `admin@sharada.edu`
- Password: `admin123`

