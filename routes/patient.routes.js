const express = require("express");
const router = express.Router();
const Patient = require("../models/patient.model");
const { verifyToken } = require("../middleware/auth.middleware");

// Helper function to send real-time notification if socket io exists
const notifyClients = (req, event, data) => {
  const io = req.app.get("socketio");
  if (io) {
    io.emit(event, data);
  }
};

// 1. Get patient queue / all patients
router.get("/", verifyToken(["doctor", "secretary"]), async (req, res) => {
  try {
    const patients = await Patient.find().sort({ createdAt: 1 });
    res.json(patients);
  } catch (error) {
    res.status(500).json({ message: "Error fetching patients", error: error.message });
  }
});

// 2. Get single patient by ID
router.get("/:id", verifyToken(["doctor", "secretary"]), async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }
    res.json(patient);
  } catch (error) {
    res.status(500).json({ message: "Error fetching patient details", error: error.message });
  }
});

// 3. Add Patient to Queue (Secretary function)
router.post("/", verifyToken(["secretary"]), async (req, res) => {
  try {
    const { name, lastName, dateOfBirth, gender, phone, email, address, job, HTA, Diabete, Tabac, Autre, presentMedications, imageXRay, imagesXRay } = req.body;

    if (!name || !lastName || !dateOfBirth || !phone) {
      return res.status(400).json({ message: "First name, last name, date of birth, and phone number are required" });
    }

    const patientData = {
      name,
      lastName,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      gender: gender || "other",
      phone,
      email,
      address,
      job,
      HTA: !!HTA,
      Diabete: !!Diabete,
      Tabac: !!Tabac,
      Autre: Autre || "",
      presentMedications: presentMedications || "",
      imageXRay: imageXRay || "",
      imagesXRay: Array.isArray(imagesXRay) ? imagesXRay : (imageXRay ? [imageXRay] : []),
      status: "waiting"
    };

    const newPatient = new Patient(patientData);
    await newPatient.save();

    notifyClients(req, "patientAdded", newPatient);

    res.status(201).json(newPatient);
  } catch (error) {
    res.status(500).json({ message: "Error adding patient to queue", error: error.message });
  }
});

// 4. Update Patient Status (Role enforcement: Doctor can set 'done', Secretary can set 'ready')
router.patch("/:id/status", verifyToken(["doctor", "secretary"]), async (req, res) => {
  try {
    const { status, secretaryAcknowledgedDone } = req.body;
    const patientId = req.params.id;
    const userRole = req.user.role;

    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    if (status === "done") {
      if (userRole !== "doctor") {
        return res.status(403).json({ message: "Only doctors can set patient status to 'done'" });
      }
      if (patient.status !== "ready") {
        return res.status(400).json({ message: "Patient must be marked READY by secretary before doctor can complete consultation" });
      }
    }

    if ((status === "ready" || status === "waiting") && userRole !== "secretary" && userRole !== "doctor") {
      return res.status(403).json({ message: "Only secretaries or doctors can toggle patient ready/waiting status" });
    }

    if (status !== undefined) {
      patient.status = status;
    }

    if (secretaryAcknowledgedDone !== undefined) {
      patient.secretaryAcknowledgedDone = secretaryAcknowledgedDone;
    }

    await patient.save();
    notifyClients(req, "patientUpdated", patient);

    if (status === "done") {
      notifyClients(req, "patientDoneNotification", {
        patient,
        message: `Doctor finished with patient ${patient.name} ${patient.lastName}`
      });
    } else if (status === "ready") {
      notifyClients(req, "patientReadyNotification", {
        patient,
        message: `Patient ${patient.name} ${patient.lastName} is READY to enter`
      });
    }

    res.json(patient);
  } catch (error) {
    res.status(500).json({ message: "Error updating patient status", error: error.message });
  }
});

// 5. Doctor fills/updates patient medical record, teeth notes & treatment sessions
router.put("/:id", verifyToken(["doctor", "secretary"]), async (req, res) => {
  try {
    const updatedPatient = await Patient.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!updatedPatient) {
      return res.status(404).json({ message: "Patient not found" });
    }
    
    notifyClients(req, "patientUpdated", updatedPatient);
    res.json(updatedPatient);
  } catch (error) {
    res.status(500).json({ message: "Error updating patient record", error: error.message });
  }
});

// 6. Add a Tooth Treatment/Condition Record
router.post("/:id/teeth-records", verifyToken(["doctor"]), async (req, res) => {
  try {
    const { toothNumber, condition, notes } = req.body;
    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    patient.teethRecords.push({ toothNumber, condition, notes, date: new Date() });
    
    // Also update tooth note in map if provided
    if (notes) {
      patient.teethNotes.set(toothNumber, notes);
    }

    await patient.save();
    res.status(201).json(patient);
  } catch (error) {
    res.status(500).json({ message: "Error saving tooth record", error: error.message });
  }
});

// 7. Add a Treatment Session (Fiche Médicale entry)
router.post("/:id/treatment-sessions", verifyToken(["doctor", "secretary"]), async (req, res) => {
  try {
    const { acte, doit, recu, date } = req.body;
    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    patient.treatmentSessions.push({
      date: date ? new Date(date) : new Date(),
      acte,
      doit: doit || "0",
      recu: recu || "0"
    });

    await patient.save();
    res.status(201).json(patient);
  } catch (error) {
    res.status(500).json({ message: "Error adding treatment session", error: error.message });
  }
});

// 8. Delete Patient from queue / records
router.delete("/:id", verifyToken(["doctor", "secretary"]), async (req, res) => {
  try {
    const deletedPatient = await Patient.findByIdAndDelete(req.params.id);
    if (!deletedPatient) {
      return res.status(404).json({ message: "Patient not found" });
    }
    notifyClients(req, "patientDeleted", { id: req.params.id });
    res.json({ message: "Patient removed", patient: deletedPatient });
  } catch (error) {
    res.status(500).json({ message: "Error deleting patient", error: error.message });
  }
});

module.exports = router;
