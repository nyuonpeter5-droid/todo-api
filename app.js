const express = require('express');
const { v4: uuidv4 } = require('uuid');
const swaggerUi = require('swagger-ui-express');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const app = express();

// Middleware
app.use(express.json());
app.use(cookieParser());

// Secrets & Stores (In production, use environment variables & a real DB)
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || 'your-access-secret-key';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'your-refresh-secret-key';

const users = [{ username: 'admin', password: 'password123' }];
let refreshTokensStore = []; // Stores active refresh tokens for invalidation on logout

// Rate Limiter for general requests
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Strict Rate Limiter for Login (prevents brute-force attacks)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many login attempts, please try again after 15 minutes." }
});

// Authentication Middleware (Verifies Access Token)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ error: "Unauthorized", message: "Access token is missing." });
  }

  jwt.verify(token, ACCESS_TOKEN_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Forbidden", message: "Invalid or expired access token." });
    }
    req.user = user;
    next();
  });
};

// In-memory database simulation
let todos = [
  {
    id: uuidv4(),
    title: "Study REST APIs",
    description: "Read a dissertation by Roy Fielding",
    state: "todo",
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
];

// Helper function to validate allowed states
const isValidState = (state) => ['todo', 'doing', 'done'].includes(state);

// CSV Utility function
function toCsv(todos) {
  const headers = ["id", "title", "description", "state", "createdAt", "updatedAt"];
  const rows = todos.map(item => [
    item.id,
    `"${(item.title || '').replace(/"/g, '""')}"`,
    `"${(item.description || '').replace(/"/g, '""')}"`,
    item.state,
    item.createdAt,
    item.updatedAt
  ]);
  return [headers.join(","), ...rows.map(row => row.join(","))].join("\n");
}

// ====================
// AUTHENTICATION ENDPOINTS
// ====================

// POST /login
app.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);

  if (!user) {
    return res.status(401).json({ error: "Unauthorized", message: "Invalid username or password." });
  }

  const payload = { username: user.username };
  const accessToken = jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: '7d' });

  refreshTokensStore.push(refreshToken);

  // Robust HTTP-only Cookie configuration for the refresh token
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true, // Prevents client-side JS access (mitigates XSS)
    secure: process.env.NODE_ENV === 'production', // Requires HTTPS in production
    sameSite: 'strict', // Protects against CSRF attacks
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days expiration
  });

  res.json({ accessToken, message: "Logged in successfully" });
});

// POST /refresh (Obtain a new access token using the refresh token cookie)
app.post('/refresh', (req, res) => {
  const cookies = req.cookies;
  if (!cookies || !cookies.refreshToken) {
    return res.status(401).json({ error: "Unauthorized", message: "Refresh token cookie missing." });
  }

  const refreshToken = cookies.refreshToken;
  if (!refreshTokensStore.includes(refreshToken)) {
    return res.status(403).json({ error: "Forbidden", message: "Refresh token is invalid or expired." });
  }

  jwt.verify(refreshToken, REFRESH_TOKEN_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Forbidden", message: "Invalid refresh token." });
    }

    const accessToken = jwt.sign({ username: user.username }, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
    res.json({ accessToken });
  });
});

// POST /logout (Invalidate refresh token and clear cookie)
app.post('/logout', (req, res) => {
  const cookies = req.cookies;
  if (cookies && cookies.refreshToken) {
    const refreshToken = cookies.refreshToken;
    refreshTokensStore = refreshTokensStore.filter(token => token !== refreshToken);
  }

  res.clearCookie('refreshToken', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production'
  });
  
  res.json({ message: "Logged out successfully." });
});

// ====================
// OPENAPI / SWAGGER SETUP
// ====================
const swaggerDocument = {
  openapi: "3.0.0",
  info: {
    title: "Todo REST API with JWT Auth",
    version: "2.0.0",
    description: "API for managing Todo items with JWT authentication, rate limiting, and CSV support"
  },
  servers: [{ url: "http://localhost:3000", description: "Local server" }],
  paths: {
    "/login": {
      post: {
        summary: "User login to receive access token and set refresh cookie",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  username: { type: "string" },
                  password: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Logged in successfully" },
          "401": { description: "Invalid credentials" }
        }
      }
    },
    "/refresh": {
      post: {
        summary: "Get a new access token using the HTTP-only refresh cookie",
        responses: {
          "200": { description: "New access token generated" },
          "401": { description: "Missing refresh token" },
          "403": { description: "Invalid refresh token" }
        }
      }
    },
    "/logout": {
      post: {
        summary: "Log out user, clear cookie, and invalidate refresh token",
        responses: {
          "200": { description: "Logged out successfully" }
        }
      }
    },
    "/todos": {
      get: {
        summary: "Get all todos (Requires Bearer Token)",
        parameters: [
          {
            in: "header",
            name: "Authorization",
            required: true,
            schema: { type: "string" },
            description: "Bearer <access_token>"
          },
          {
            in: "query",
            name: "state",
            schema: { type: "string", enum: ["todo", "doing", "done"] }
          }
        ],
        responses: {
          "200": { description: "Successful response" },
          "401": { description: "Unauthorized" }
        }
      },
      post: {
        summary: "Create a new todo item (Requires Bearer Token)",
        parameters: [{
          in: "header",
          name: "Authorization",
          required: true,
          schema: { type: "string" }
        }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title"],
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  state: { type: "string", enum: ["todo", "doing", "done"] }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Created successfully" },
          "401": { description: "Unauthorized" }
        }
      }
    }
  }
};

app.use('/doc', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// ====================
// TODO ENDPOINTS (Protected with authenticateToken)
// ====================

app.get('/', (req, res) => {
  res.json({ message: "Welcome to the Secured Todo API! Use /login to get tokens and /doc for documentation." });
});

app.get('/todos', authenticateToken, (req, res) => {
  const { state } = req.query;
  let filteredTodos = todos;

  if (state) {
    if (!isValidState(state)) {
      return res.status(400).json({ error: "Bad Request", message: "Invalid state filter." });
    }
    filteredTodos = todos.filter(item => item.state === state);
  }

  const format = req.accepts(['json', 'text/csv']);
  if (format === 'text/csv') {
    res.setHeader('Content-Type', 'text/csv');
    return res.send(toCsv(filteredTodos));
  }

  res.json(filteredTodos);
});

app.get('/todos/:id', authenticateToken, (req, res) => {
  const todo = todos.find(item => item.id === req.params.id);
  if (!todo) return res.status(404).json({ error: "Not Found" });
  res.json(todo);
});

app.post('/todos', authenticateToken, (req, res) => {
  const { title, description, state } = req.body;
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: "Bad Request", message: "Title is required." });
  }

  const todoState = state || 'todo';
  if (!isValidState(todoState)) return res.status(400).json({ error: "Invalid state" });

  const now = Date.now();
  const newTodo = { id: uuidv4(), title: title.trim(), description: description ? description.trim() : "", state: todoState, createdAt: now, updatedAt: now };
  todos.push(newTodo);
  res.status(201).json(newTodo);
});

app.put('/todos/:id', authenticateToken, (req, res) => {
  const index = todos.findIndex(item => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Not Found" });

  const { title, description, state } = req.body;
  if (title !== undefined) todos[index].title = title.trim();
  if (state !== undefined) {
    if (!isValidState(state)) return res.status(400).json({ error: "Invalid state" });
    todos[index].state = state;
  }
  if (description !== undefined) todos[index].description = description.trim();
  todos[index].updatedAt = Date.now();

  res.json(todos[index]);
});

app.delete('/todos/:id', authenticateToken, (req, res) => {
  const index = todos.findIndex(item => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Not Found" });

  const deletedItem = todos.splice(index, 1)[0];
  res.json({ message: "Deleted successfully", deletedItem });
});

module.exports = { app, todos, isValidState, toCsv };