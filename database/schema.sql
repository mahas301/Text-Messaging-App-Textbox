-- ============================================
-- TextBox Database Schema
-- Run this in phpMyAdmin > textbox_db > SQL tab
-- ============================================

CREATE DATABASE IF NOT EXISTS textbox_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE textbox_db;

-- Drop tables in safe order
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS phone_numbers;
DROP TABLE IF EXISTS users;

-- Users table
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    theme VARCHAR(10) DEFAULT 'dark',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Phone numbers (one user can have many)
CREATE TABLE phone_numbers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    phone_number VARCHAR(20) NOT NULL UNIQUE,
    label VARCHAR(50) DEFAULT 'Personal',
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Conversations (one per user per contact)
CREATE TABLE conversations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    owner_user_id INT NOT NULL,
    owner_phone_id INT NOT NULL,
    contact_number VARCHAR(20) NOT NULL,
    contact_name VARCHAR(100),
    subject VARCHAR(200),
    status ENUM('inbox','spam','trash') DEFAULT 'inbox',
    is_read TINYINT(1) DEFAULT 0,
    last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_phone_id) REFERENCES phone_numbers(id) ON DELETE CASCADE,
    UNIQUE KEY unique_convo (owner_phone_id, contact_number)
);

-- Messages
CREATE TABLE messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT NOT NULL,
    sender_number VARCHAR(20) NOT NULL,
    body TEXT NOT NULL,
    direction ENUM('inbound','outbound') NOT NULL,
    is_deleted TINYINT(1) DEFAULT 0,
    deleted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Contacts table (safe add - won't break existing data)
CREATE TABLE IF NOT EXISTS contacts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_contact (user_id, phone_number)
);
