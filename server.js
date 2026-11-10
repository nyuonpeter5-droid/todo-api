const express = require('express');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

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

// ====================
// ENDPOINTS
// ====================

// Root route
app.get('/', (req, res) => {
  res.json({ message: "Welcome to the Todo API! Use /todos to interact with tasks." });
});

// 1. GET /todos (Supports filtering by ?state=todo|doing|done)
app.get('/todos', (req, res) => {
  const { state } = req.query;

  if (state) {
    if (!isValidState(state)) {
      return res.status(400).json({ 
        error: "Bad Request", 
        message: "Invalid state filter. Allowed values: 'todo', 'doing', 'done'." 
      });
    }
    const filteredTodos = todos.filter(item => item.state === state);
    return res.json(filteredTodos);
  }

  res.json(todos);
});

// 2. GET /todos/{id} (Get single todo by ID)
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

// 3. POST /todos (Create a new todo item)
app.post('/todos', (req, res) => {
  const { title, description, state } = req.body;

  // Validate required title
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ 
      error: "Bad Request", 
      message: "Title is required and must be a non-empty string." 
    });
  }

  // Determine state (default to 'todo' if not provided)
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

// 4. PUT /todos/{id} (Update an existing todo item)
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

  // Validate title if provided
  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ 
        error: "Bad Request", 
        message: "Title must be a non-empty string." 
      });
    }
    todos[index].title = title.trim();
  }

  // Validate state if provided
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

// 5. DELETE /todos/{id} (Delete a todo item)
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

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});