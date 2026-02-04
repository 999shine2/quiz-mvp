
import 'dotenv/config';
import mongoose from 'mongoose';
import { User } from '../models/User.js';

const uri = process.env.MONGODB_URI;

async function run() {
    if (!uri) {
        console.error("No MONGODB_URI found.");
        process.exit(1);
    }

    try {
        await mongoose.connect(uri);
        console.log("Connected to DB.");

        // Search for 'jeongmin' or users containing 'jeong'
        const users = await User.find({ userId: { $regex: 'jeong', $options: 'i' } });

        if (users.length === 0) {
            console.log("No user found matching 'jeong'.");
        } else {
            console.log("Found Users:");
            users.forEach(u => {
                console.log(`- ID: ${u.userId} | Password: ${u.password}`);
            });
        }

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

run();
