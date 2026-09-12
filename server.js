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
    "https://dental-cabinet-mu.vercel.app",
    "https://dental-cabinet.vercel.app",
    "http://localhost:5173",
    "http://localhost:3000"
  ].filter(Boolean);

const isOriginAllowed = (origin) => {
  if (!origin) return true; // server-to-server or mobile/curl
  return rawAllowedOrigins.some((allowed) => {
    if (allowed === "*" || allowed === origin) return true;
    if (origin.includes("localhost")) return true;
    // Allow any Vercel deployment preview / production of this frontend
    if (origin.endsWith(".vercel.app") && origin.includes("dental-cabinet")) return true;
    return false;
  });
};

const corsOriginHandler = (origin, callback) => {
  if (isOriginAllowed(origin)) {
    callback(null, true);
  } else {
    console.warn(`Blocked by CORS origin: ${origin}`);
    callback(new Error(`CORS blocked for origin: ${origin}`));
  }
};

// Socket.io initialization for real-time notifications (Secretary <-> Doctor)
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      callback(null, isOriginAllowed(origin));
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
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
  origin: (origin, callback) => {
    callback(null, isOriginAllowed(origin));
  },
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 204
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));


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