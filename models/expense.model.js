const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const expenseSchema = new Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  cost: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  category: {
    type: String,
    default: "Autre", // Matériel dentaire, Équipement, Facture, Loyer, Entretien, etc.
    trim: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    default: "",
    trim: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: false
  }
}, { timestamps: true });

module.exports = mongoose.model("Expense", expenseSchema);
