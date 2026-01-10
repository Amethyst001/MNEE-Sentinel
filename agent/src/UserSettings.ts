import sqlite3 from 'sqlite3';
import { Database, open } from 'sqlite';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * @title UserSettings
 * @notice Production-grade persistent user settings stored in SQLite.
 *         Survives bot restarts. Supports re-enrollment and overrides.
 */
export class UserSettings {
    private db: Database | null = null;
    private dbPath: string;
    private initialized: boolean = false;

    constructor() {
        this.dbPath = path.join(__dirname, '../../data/sentinel.db');
    }

    async init(): Promise<void> {
        if (this.initialized) return;

        try {
            this.db = await open({
                filename: this.dbPath,
                driver: sqlite3.Database
            });

            // Base Schema (v3 - Support for String Keys)
            await this.db.exec(`
                CREATE TABLE IF NOT EXISTS user_settings_v3 (
                    user_id TEXT PRIMARY KEY,
                    username TEXT,
                    is_authorized INTEGER DEFAULT 0,
                    voice_enrolled INTEGER DEFAULT 0,
                    voice_profile_hash TEXT,
                    wallet_address TEXT,
                    pin_hash TEXT,
                    created_at TEXT,
                    updated_at TEXT
                )
            `);

            // Migration: Add pin_hash if missing (for existing dbs)
            try {
                await this.db.exec(`ALTER TABLE user_settings_v3 ADD COLUMN pin_hash TEXT`);
            } catch (e) {
                // Column likely exists, ignore
            }

            this.initialized = true;
            console.log("👤 UserSettings: SQLite initialized");
        } catch (error) {
            console.error("UserSettings init error:", error);
        }
    }

    /**
     * Get user settings, creating if not exists
     */
    async getUser(userId: string | number, username?: string): Promise<UserData> {
        await this.init();
        if (!this.db) throw new Error("Database not initialized");

        let user = await this.db.get<UserData>(
            'SELECT * FROM user_settings_v3 WHERE user_id = ?',
            userId
        );

        if (!user) {
            const now = new Date().toISOString();
            await this.db.run(
                `INSERT INTO user_settings_v3 (user_id, username, created_at, updated_at) VALUES (?, ?, ?, ?)`,
                userId, username || 'unknown', now, now
            );
            user = await this.db.get<UserData>('SELECT * FROM user_settings_v3 WHERE user_id = ?', userId);
        }

        return user!;
    }

    // --- PIN SECURITY METHODS ---

    /**
     * Set a new 4-digit PIN (Hashed)
     */
    async setPin(userId: string | number, pin: string): Promise<void> {
        await this.init();
        if (!this.db) return;

        // Salt + Hash
        const hash = crypto.createHash('sha256').update(userId + "_MNEE_" + pin).digest('hex');

        await this.db.run(
            'UPDATE user_settings_v3 SET pin_hash = ?, updated_at = ? WHERE user_id = ?',
            hash, new Date().toISOString(), userId
        );
        console.log(`🔐 PIN set for User ${userId}`);
    }

    /**
     * Validate the PIN
     */
    async validatePin(userId: string | number, pin: string): Promise<boolean> {
        await this.init();
        if (!this.db) return false;

        const user = await this.getUser(userId);
        if (!user.pin_hash) return false; // No PIN set

        const attemptHash = crypto.createHash('sha256').update(userId + "_MNEE_" + pin).digest('hex');
        return attemptHash === user.pin_hash;
    }

    /**
     * Check if user has a PIN configured
     */
    async hasPin(userId: string | number): Promise<boolean> {
        const user = await this.getUser(userId);
        return !!user.pin_hash;
    }

    // --- EXISTING METHODS (Preserved) ---

    async setAuthorized(userId: string | number, authorized: boolean): Promise<void> {
        await this.init();
        if (!this.db) return;
        await this.db.run('UPDATE user_settings_v3 SET is_authorized = ?, updated_at = ? WHERE user_id = ?', authorized ? 1 : 0, new Date().toISOString(), userId);
    }

    async enrollVoice(userId: string | number, profileHash: string): Promise<void> {
        await this.init();
        if (!this.db) return;
        await this.db.run('UPDATE user_settings_v3 SET voice_enrolled = 1, voice_profile_hash = ?, updated_at = ? WHERE user_id = ?', profileHash, new Date().toISOString(), userId);
    }

    async clearVoice(userId: string | number): Promise<void> {
        await this.init();
        if (!this.db) return;
        await this.db.run('UPDATE user_settings_v3 SET voice_enrolled = 0, voice_profile_hash = NULL, updated_at = ? WHERE user_id = ?', new Date().toISOString(), userId);
    }

    async setWallet(userId: string | number, walletAddress: string): Promise<void> {
        await this.init();
        if (!this.db) return;
        await this.db.run('UPDATE user_settings_v3 SET wallet_address = ?, updated_at = ? WHERE user_id = ?', walletAddress, new Date().toISOString(), userId);
    }

    async clearWallet(userId: string | number): Promise<void> {
        await this.init();
        if (!this.db) return;
        await this.db.run('UPDATE user_settings_v3 SET wallet_address = NULL, updated_at = ? WHERE user_id = ?', new Date().toISOString(), userId);
    }

    async isVoiceEnrolled(userId: string | number): Promise<boolean> {
        const user = await this.getUser(userId);
        return user.voice_enrolled === 1;
    }

    async isAuthorized(userId: string | number): Promise<boolean> {
        const user = await this.getUser(userId);
        return user.is_authorized === 1;
    }
}

interface UserData {
    user_id: number;
    username: string;
    is_authorized: number;
    voice_enrolled: number;
    voice_profile_hash: string | null;
    wallet_address: string | null;
    pin_hash: string | null; // NEW
    created_at: string;
    updated_at: string;
}
