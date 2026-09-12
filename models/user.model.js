const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    lastName: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    role: {
        type: String,
        enum: ["doctor", "secretary"],
        default: "secretary",
        required: true
    },
    password: {
        type: String,
        required: true
    },
    specialty: {
        type: String,
        required: false,
        default: "Médecin Dentiste"
    },
    phone: {
        type: String,
        required: false
    },
    image: {
        type: String,
        required: false
    },
    dateOfBirth: {
        type: Date,
        required: false
    },
    gender: {
        type: String,
        enum: ["male", "female", "other"],
        required: false
    },
    refreshToken: {
        type: String,
        default: null
    }
}, { timestamps: true });

module.exports = mongoose.model("User", UserSchema);
