-- Add a new table for test recommendations

CREATE TABLE TestRecommendations (
    RecommendationID INT IDENTITY(1,1) PRIMARY KEY,
    DoctorID INT NOT NULL,
    PatientID INT NOT NULL,
    RecommendedAt DATETIME DEFAULT GETDATE(),
    Status VARCHAR(20) DEFAULT 'Pending', -- Pending, Completed, Rejected
    CompletedAt DATETIME NULL,
    FOREIGN KEY (DoctorID) REFERENCES Users(UserID),
    FOREIGN KEY (PatientID) REFERENCES Users(UserID)
);

-- Add a new table for reports with additional metadata
CREATE TABLE Reports (
    ReportID INT IDENTITY(1,1) PRIMARY KEY,
    DoctorID INT NOT NULL,
    PatientID INT NOT NULL,
    FilePath VARCHAR(255) NOT NULL,
    ReportName VARCHAR(255) NOT NULL,
    ReportType VARCHAR(50) DEFAULT 'FRT', -- Report type (FRT, General, etc.)
    IncludedTestIDs VARCHAR(MAX), -- Store included test IDs as comma-separated list
    GeneratedAt DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (DoctorID) REFERENCES Users(UserID),
    FOREIGN KEY (PatientID) REFERENCES Users(UserID)
);
