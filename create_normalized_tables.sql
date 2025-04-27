-- First create a base Users table with common fields
CREATE TABLE Users (
    UserID INT IDENTITY(1,1) PRIMARY KEY,
    FullName NVARCHAR(100) NOT NULL,
    Email NVARCHAR(100) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL,
    Role NVARCHAR(50) NOT NULL CHECK (Role IN ('Patient', 'Doctor')),
    CreatedAt DATETIME DEFAULT GETDATE(),
    ProfileCompleted BIT DEFAULT 0,
    PhoneNumber NVARCHAR(20) NULL
);

-- Table for Doctor profiles
CREATE TABLE DoctorProfiles (
    DoctorProfileID INT IDENTITY(1,1) PRIMARY KEY,
    UserID INT NOT NULL,
    DoctorID NVARCHAR(6) NOT NULL UNIQUE,
    PMDC_No NVARCHAR(50) NULL,
    Specialization NVARCHAR(100) NULL,
    OfficeHours NVARCHAR(100) NULL,
    HospitalClinic NVARCHAR(255) NULL,
    Experience NVARCHAR(50) NULL,
    Education NVARCHAR(255) NULL,
    FOREIGN KEY (UserID) REFERENCES Users(UserID)
);

-- Table for Patient profiles
CREATE TABLE PatientProfiles (
    PatientProfileID INT IDENTITY(1,1) PRIMARY KEY,
    UserID INT NOT NULL,
    DOB DATE NULL,
    Gender NVARCHAR(20) NULL,
    Address NVARCHAR(255) NULL,
    EmergencyContact NVARCHAR(100) NULL,
    EmergencyPhone NVARCHAR(20) NULL,
    MedicalHistory NVARCHAR(MAX) NULL,
    HasDoctor BIT DEFAULT 0,
    DoctorID NVARCHAR(6) NULL,
    FOREIGN KEY (UserID) REFERENCES Users(UserID)
);

-- Keep FRTResults table as is, it already relates to Users
CREATE TABLE FRTResults (
    ResultID INT IDENTITY(1,1) PRIMARY KEY,
    UserID INT NOT NULL,
    MaxDistance FLOAT NOT NULL,
    RiskLevel VARCHAR(100) NOT NULL,
    CreatedAt DATETIME DEFAULT GETDATE(),
    Symptoms NVARCHAR(MAX),
    FOREIGN KEY (UserID) REFERENCES Users(UserID)
);

-- Table for Chat Messages between doctors and patients
CREATE TABLE ChatMessages (
    MessageID INT IDENTITY(1,1) PRIMARY KEY,
    SenderID INT NOT NULL,
    RecipientID INT NOT NULL,
    Message NVARCHAR(MAX) NOT NULL,
    Timestamp DATETIME DEFAULT GETDATE(),
    IsRead BIT DEFAULT 0,
    SenderEncryptedMessage NVARCHAR(MAX) NULL,
    RecipientEncryptedMessage NVARCHAR(MAX) NULL,
    SenderEncryptedFile VARBINARY(MAX) NULL,
    RecipientEncryptedFile VARBINARY(MAX) NULL,
    FileMetadata NVARCHAR(MAX) NULL,  -- Store filename, type, size as JSON
    FOREIGN KEY (SenderID) REFERENCES Users(UserID),
    FOREIGN KEY (RecipientID) REFERENCES Users(UserID)
);

-- Add table for encryption keys
CREATE TABLE UserEncryptionKeys (
    KeyID INT IDENTITY(1,1) PRIMARY KEY,
    UserID INT NOT NULL,
    PublicKey NVARCHAR(MAX) NOT NULL,
    PrivateKey NVARCHAR(MAX) NOT NULL,  -- In a real app, private keys should be stored client-side only
    CreatedAt DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (UserID) REFERENCES Users(UserID)
);
