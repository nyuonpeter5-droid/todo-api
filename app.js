const express = require('express');
const { v4: uuidv4 } = require('uuid');
const swaggerUi = require('swagger-ui-express');

const app = express();

// Middleware to parse JSON request bodies
app.use(express.json());

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
// OPENAPI / SWAGGER SETUP
// ====================
const swaggerDocument = {
  openapi: "3.0.0",
  info: {
    title: "Todo REST API",
    version: "1.0.0",
    description: "API for managing Todo items with JSON and CSV support"
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "Local development server"
    }
  ],
  paths: {
    "/todos": {
      get: {
        summary: "Get all todos (supports state filtering & CSV format)",
        parameters: [
          {
            in: "query",
            name: "state",
            schema: {
              type: "string",
              enum: ["todo", "doing", "done"]
            },
            description: "Filter todos by state"
          }
        ],
        responses: {
          "200": {
            description: "Successful response",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      title: { type: "string" },
                      description: { type: "string" },
                      state: { type: "string", enum: ["todo", "doing", "done"] },
                      createdAt: { type: "integer" },
                      updatedAt: { type: "integer" }
                    }
                  }
                }
              },
              "text/csv": {
                schema: {
                  type: "string",
                  example: "id,title,description,state,createdAt,updatedAt\n123,\"Task Title\",\"Description\",todo,1600000000000,1600000000000"
                }
              }
            }
          },
          "400": {
            description: "Bad Request (Invalid state filter)"
          }
        }
      },
      post: {
        summary: "Create a new todo item",
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
          "201": {
            description: "Created successfully"
          },
          "400": {
            description: "Bad Request (Missing title or invalid state)"
          }
        }
      }
    },
    "/todos/{id}": {
      get: {
        summary: "Get a todo by ID",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          "200": { description: "Todo found" },
          "404": { description: "Not Found" }
        }
      },
      put: {
        summary: "Update an existing todo",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string" }
          }
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
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
          "200": { description: "Updated successfully" },
          "400": { description: "Bad Request" },
          "404": { description: "Not Found" }
        }
      },
      delete: {
        summary: "Delete a todo item",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          "200": { description: "Successfully deleted" },
          "404": { description: "Not Found" }
        }
      }
    }
  }
};

// Serve Swagger UI at /doc
app.use('/doc', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// ====================
// ENDPOINTS
// ====================

// Root route
app.get('/', (req, res) => {
  res.json({ message: "Welcome to the Todo API! Use /todos to interact with tasks and /doc for documentation." });
});

// GET /todos (Supports filtering by ?state=todo|doing|done and Content Negotiation for CSV/JSON)
app.get('/todos', (req, res) => {
  const { state } = req.query;
  let filteredTodos = todos;

  if (state) {
    if (!isValidState(state)) {
      return res.status(400).json({ 
        error: "Bad Request", 
        message: "Invalid state filter. Allowed values: 'todo', 'doing', 'done'." 
      });
    }
    filteredTodos = todos.filter(item => item.state === state);
  }

  // Check client accept header preference
  const format = req.accepts(['json', 'text/csv']);
  if (format === 'text/csv') {
    res.setHeader('Content-Type', 'text/csv');
    return res.send(toCsv(filteredTodos));
  }

  res.json(filteredTodos);
});

// GET /todos/:id (Get single todo by ID)
app.get('/todos/:id', (req, res) => {
  const { id } = req.params;
  const todo = todos.find(item => item.id === id);

  if (!todo) {
    return res.status(404).json({ 
      error: "Not Found", 
      message: `Todo item with ID '${id}' not found.` 
    });
  }

  res.json(todo);
});

// POST /todos (Create a new todo item)
app.post('/todos', (req, res) => {
  const { title, description, state } = req.body;

  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ 
      error: "Bad Request", 
      message: "Title is required and must be a non-empty string." 
    });
  }

  const todoState = state || 'todo';
  if (!isValidState(todoState)) {
    return res.status(400).json({ 
      error: "Bad Request", 
      message: "Invalid state. Allowed values: 'todo', 'doing', 'done'." 
    });
  }

  const now = Date.now();
  const newTodo = {
    id: uuidv4(),
    title: title.trim(),
    description: description ? description.trim() : "",
    state: todoState,
    createdAt: now,
    updatedAt: now
  };

  todos.push(newTodo);
  res.status(201).json(newTodo);
});

// PUT /todos/:id (Update an existing todo item)
app.put('/todos/:id', (req, res) => {
  const { id } = req.params;
  const { title, description, state } = req.body;

  const index = todos.findIndex(item => item.id === id);
  if (index === -1) {
    return res.status(404).json({ 
      error: "Not Found", 
      message: `Todo item with ID '${id}' not found.` 
    });
  }

  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ 
        error: "Bad Request", 
        message: "Title must be a non-empty string." 
      });
    }
    todos[index].title = title.trim();
  }

  if (state !== undefined) {
    if (!isValidState(state)) {
      return res.status(400).json({ 
        error: "Bad Request", 
        message: "Invalid state. Allowed values: 'todo', 'doing', 'done'." 
      });
    }
    todos[index].state = state;
  }

  if (description !== undefined) {
    todos[index].description = description.trim();
  }

  todos[index].updatedAt = Date.now();

  res.json(todos[index]);
});

// DELETE /todos/:id (Delete a todo item)
app.delete('/todos/:id', (req, res) => {
  const { id } = req.params;
  const index = todos.findIndex(item => item.id === id);

if (index === -1) {
    return res.status(404).json({ 
      error: "Not Found", 
      message: `Todo item with ID '${id}' not found.` 
    });
  }

  const deletedItem = todos.splice(index, 1)[0];
  res.json({ 
    message: "Todo item successfully deleted.", 
    deletedItem 
  });
});

module.exports = { app, todos, isValidState, toCsv };