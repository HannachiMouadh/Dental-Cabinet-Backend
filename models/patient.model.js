const mongoose = require("mongoose");

const teethRecordSchema = new mongoose.Schema({
  toothNumber: { type: String, required: true }, // e.g. "11", "27", "51"
  condition: { type: String, default: "Healthy" }, // Healthy, Caries, Extracted, Filled, Crown, Root Canal, Missing, Implant, etc.
  notes: { type: String, default: "" },
  date: { type: Date, default: Date.now }
});

const treatmentSessionSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  acte: { type: String, default: "" },
  doit: { type: String, default: "0" },
  recu: { type: String, default: "0" }
});

const patientSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  job: { type: String, required: false },
  address: { type: String, required: false },
  dateOfBirth: { type: Date, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: false },
  gender: { type: String, enum: ["male", "female", "other"], required: false },
  imageXRay: { type: String, required: false }, // Single Base64 legacy fallback
  imagesXRay: [{ type: String }], // Array of Base64 or Image URLs for multiple X-Rays
  
  // Medical Antecedents
  HTA: { type: Boolean, default: false },
  Diabete: { type: Boolean, default: false },
  Tabac: { type: Boolean, default: false },
  Autre: { type: String, default: "" },
  presentMedications: { type: String, default: "" },

  // Consultation records list (Medical Card table)
  treatmentSessions: [treatmentSessionSchema],

  // Teeth record history per tooth
  teethRecords: [teethRecordSchema],

  // Teeth notes overview per tooth input fields
  teethNotes: {
    type: Map,
    of: String,
    default: {}
  },

  // Teeth conditions per tooth FDI (Healthy, Caries, Extracted, etc.)
  teethConditions: {
    type: Map,
    of: String,
    default: {}
  },

  status: {
    type: String,
    enum: ["waiting", "ready", "done", "none"],
    default: "none",
  },
  secretaryAcknowledgedDone: {
    type: Boolean,
    default: false
  },
  ordonnanceText: {
    type: String,
    default: ""
  }
}, { timestamps: true });

module.exports = mongoose.model("Patient", patientSchema);
