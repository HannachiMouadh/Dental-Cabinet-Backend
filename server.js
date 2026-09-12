const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

dotenv.config();

const app = express();
const server = http.createServer(app);

// Parse allowed origins from .env (comma-separated or single local/prod URLs)
const rawAllowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim().replace(/\/$/, ''))
  : [
    process.env.CLIENT_URL_LOCAL,
    process.env.CLIENT_URL_PROD,
  ].filter(Boolean);

const corsOriginHandler = (origin, callback) => {
  // Allow requests with no origin (like mobile apps, curl, server-to-server)
  if (!origin) return callback(null, true);
  
  const isAllowed = rawAllowedOrigins.some((allowed) => {
    // Exact match or localhost match during development
    return allowed === origin || allowed === "*" || (process.env.NODE_ENV !== "production" && origin.includes("localhost"));
  });

  if (isAllowed) {
    callback(null, true);
  } else {
    callback(new Error(`CORS blocked for origin: ${origin}`));
  }
};

// Socket.io initialization for real-time notifications (Secretary <-> Doctor)
const io = new Server(server, {
  cors: {
    origin: corsOriginHandler,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    credentials: true
  }
});

// Attach socket io instance to app
app.set("socketio", io);

io.on("connection", (socket) => {
  console.log("Client connected to WebSocket:", socket.id);

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// Middlewares
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const corsOptions = {
  origin: corsOriginHandler,
  optionsSuccessStatus: 200,
  credentials: true
};
app.use(cors(corsOptions));

// Database connection
const dbUri = process.env.DATABASECLOUD || process.env.DATABASE_URL || process.env.MONGODB_URI;

if (!dbUri) {
  console.error("FATAL ERROR: DATABASECLOUD environment variable is not defined in the current environment!");
} else {
  mongoose
    .connect(dbUri)
    .then(() => {
      console.log("DataBase Successfully Connected");
    })
    .catch((err) => {
      console.error("Unable to connect to database:", err.message);
    });
}


// Routes
const authRoutes = require("./routes/user.routes");
const patientRoutes = require("./routes/patient.routes");
const financeRoutes = require("./routes/finance.routes");

app.use("/api/users", authRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/finance", financeRoutes);


app.get("/", (req, res) => {
  res.send("Dentist Clinic API Running");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;