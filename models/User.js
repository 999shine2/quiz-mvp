
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true }, // e.g., 'jeongminseo'
    password: { type: String, required: false }, // optional for now (as migration is ongoing)
    createdAt: { type: Date, default: Date.now }
});

export const User = mongoose.model('User', userSchema);
