const express = require("express");
const mysql = require("mysql");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcrypt");

const app = express();
app.use(cors());
app.use(express.json());

const SECRET_KEY = "your_secret_key";

const ADMIN_CREDENTIALS = {
  username: "admin@mail.com",
  password: "admin123",
};

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "fyp",
});

app.listen(8081, () => {
  console.log("Listening");
});

// Configure multer for file uploads
// Serve static files from the uploads directory
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = "uploads/";
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath);
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});


//Fundraiser Signup
const upload = multer({ storage: storage });

app.post("/fsignup", upload.array("files", 10), async (req, res) => {
  try {
    const {
      full_name,
      username,
      phone_number,
      password,
      email,
      ethereum_wallet_address,
    } = req.body;

    // Check if username or email already exists
    const checkExistingSql = "SELECT * FROM fundraisers WHERE username = ? OR email = ?";
    db.query(checkExistingSql, [username, email], async (checkErr, checkResult) => {
      if (checkErr) {
        console.error("Database error during validation:", checkErr);
        return res.status(500).json({ error: "Database error during validation" });
      }

      if (checkResult.length > 0) {
        // Check which field(s) already exist
        const existingUser = checkResult[0];
        if (existingUser.username === username && existingUser.email === email) {
          return res.status(400).json({ error: "Both username and email already exist" });
        } else if (existingUser.username === username) {
          return res.status(400).json({ error: "Username already exists" });
        } else if (existingUser.email === email) {
          return res.status(400).json({ error: "Email already exists" });
        }
      }

      // If no existing user found, proceed with insertion
      const fileNames = req.files.map((file) => file.filename);
      const hashedPassword = await bcrypt.hash(password, 10);

      const insertSql = `
        INSERT INTO fundraisers 
        (full_name, username, phone_number, email, password, ethereum_wallet_address, ver_document, approval) 
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
      `;

      const values = [
        full_name,
        username,
        phone_number,
        email,
        hashedPassword,
        ethereum_wallet_address,
        JSON.stringify(fileNames),
      ];

      db.query(insertSql, values, (insertErr, insertData) => {
        if (insertErr) {
          console.error("Database error during insertion:", insertErr);
          return res.status(500).json({ error: "Database error during insertion" });
        }
        return res.status(200).json({ message: "Insert Success" });
      });
    });
  } catch (error) {
    console.error("Error during signup:", error);
    return res.status(500).json({ error: "Server error" });
  }
});


//Investor Signup
app.post("/isignup", async (req, res) => {
  const {
    username,
    email,
    password,
    full_name,
    phone_number,
    ethereum_wallet_address,
  } = req.body;
  console.log(req.body);

  // Check if username or email already exists
  const checkExistingSql = "SELECT * FROM investors WHERE username = ? OR email = ?";
  db.query(checkExistingSql, [username, email], async (checkErr, checkResult) => {
    if (checkErr) {
      return res.status(500).json({ error: "Database error during validation" });
    }

    if (checkResult.length > 0) {
      // Check which field(s) already exist
      const existingUser = checkResult[0];
      if (existingUser.username === username && existingUser.email === email) {
        return res.status(400).json({ error: "Both username and email already exist" });
      } else if (existingUser.username === username) {
        return res.status(400).json({ error: "Username already exists" });
      } else if (existingUser.email === email) {
        return res.status(400).json({ error: "Email already exists" });
      }
    }

    // If no existing user found, proceed with insertion
    try {
      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);

      const insertSql = `INSERT INTO investors (username, email, password, full_name, phone_number, ethereum_wallet_address) VALUES (?)`;
      const values = [
        username,
        email,
        hashedPassword,
        full_name,
        phone_number,
        ethereum_wallet_address,
      ];
      console.log(values);

      db.query(insertSql, [values], (insertErr, insertData) => {
        if (insertErr) {
          return res.status(500).json({ error: "Database error during insertion" });
        }
        return res.status(200).json({ message: "Insert Success" });
      });
    } catch (hashError) {
      return res.status(500).json({ error: "Error hashing password" });
    }
  });
});


//All user login
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  // Check for admin credentials
  if (
    email === ADMIN_CREDENTIALS.username &&
    password === ADMIN_CREDENTIALS.password
  ) {
    const token = jwt.sign({ role: "admin" }, SECRET_KEY, { expiresIn: "24h" });
    res.cookie("auth_token", token, {
      httpOnly: true,
      secure: true, // Use true if using HTTPS
      sameSite: "Strict",
      maxAge: 24*60*60*1000 // 1 day
    });
    return res.json({ message: "Admin login successful", token });
  }

  // Define SQL queries for both tables
  const sqlInvestor = "SELECT * FROM investors WHERE email = ?";
  const sqlFundraiser = "SELECT * FROM fundraisers WHERE email = ?";

  // Query the 'test' table
  db.query(sqlInvestor, [email], (err, data) => {
    if (err) {
      return res.status(500).json({ error: "Database error" });
    }

    // If user found in investor table
    if (data.length > 0) {
      const user = data[0];
      bcrypt.compare(password, user.password, (err, result) => {
        if (result) {
          const token = jwt.sign(
            {
              id: user.investor_id,
              username: user.username,
              email: user.email,
              role: "investor",
            },
            SECRET_KEY,
            { expiresIn: "1h" }
          );
          res.cookie("auth_token", token, {
            httpOnly: true,
            secure: true, // Use true if using HTTPS
            sameSite: "Strict",
            maxAge: 24*60*60*1000, // 1 hour
          });
          return res.json({ message: "Success", token });
        } else {
          return res.status(401).json({ message: "Invalid credentials" });
        }
      });
    } else {
      // Query if not found in fundraisers table
      db.query(sqlFundraiser, [email], (err, data) => {
        if (err) {
          return res.status(500).json({ error: "Database error" });
        }

        // If user found in 'fundraiser' table
        if (data.length > 0) {
          const user = data[0];
          bcrypt.compare(password, user.password, (err, result) => {
            if (result) {
              const token = jwt.sign(
                {
                  id: user.fundraiser_id,
                  username: user.username,
                  email: user.email,
                  role: "fundraiser",
                }, //Return with fundraiser role
                SECRET_KEY,
                { expiresIn: "2h" }
              );
              res.cookie("auth_token", token, {
                httpOnly: true,
                secure: true, // Use true if using HTTPS
                sameSite: "Strict",
                maxAge: 24*60*60*1000, // 1 day
              });
              return res.json({ message: "Success", token });
            } else {
              return res.status(401).json({ message: "Invalid credentials" });
            }
          });
        } else {
          // If user not found in either table
          return res.status(401).json({ message: "Invalid credentials" });
        }
      });
    }
  });
});


// Verify user token
app.get("/user", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) return res.status(401).json({ message: "No token provided" });

  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err)
      return res.status(500).json({ message: "Failed to authenticate token" });
    let sql;
    if (decoded.role === "investor") {
      sql = "SELECT * FROM investors WHERE investor_id = ?";
    } else if (decoded.role === "fundraiser") {
      sql = "SELECT * FROM fundraisers WHERE fundraiser_id = ?";
    } else {
      return res.status(400).json({ message: "Invalid user role" });
    }

    db.query(sql, [decoded.id], (err, data) => {
      if (err) return res.status(500).json("Error fetching profile data");
      if (data.length > 0) {
        res.json({...data[0], role: decoded.role});
      } else {
        res.status(404).json({ message: "User not found" });
      }
    });
  });
});

/* Update profile */
// user update request
app.put("/update", (req, res) => {
  const token = req.headers["authorization"];
  if (!token) return res.status(401).json({ message: "No token provided" });

  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err)
      return res.status(500).json({ message: "Failed to authenticate token" });

    const { username, phone_number, email, profile_picture } = req.body;
    
    let table, idField;
    if (decoded.role === 'investor') {
      table = 'investors';
      idField = 'investor_id';
    } else if (decoded.role === 'fundraiser') {
      table = 'fundraisers';
      idField = 'fundraiser_id';
    } else {
      return res.status(400).json({ message: "Invalid user role" });
    }

    const sql = `UPDATE ${table} SET username = ?, phone_number = ?, email = ?, profile_picture = ? WHERE ${idField} = ?`;
    
    db.query(sql, [username, phone_number, email, profile_picture, decoded.id], (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: "Error updating profile data", error: err.message });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ message: "Profile updated successfully" });
    });
  });
});


//ADMIN PAGE
// Fetch all fundraiser users
app.get("/fundraisers", async (req, res) => {
  const sql = "SELECT * FROM fundraisers";

  db.query(sql, async (err, results) => {
    if (err) {
      return res.status(500).json({ error: "Database error" });
    }
    
    const processedResults = await Promise.all(results.map(async (fundraiser) => {
      let documents = [];
      if (fundraiser.ver_document) {
        const fileNames = JSON.parse(fundraiser.ver_document);
        documents = fileNames.map(fileName => ({
          name: fileName,
          url: `/uploads/${fileName}`
        }));
      }
      return {
        ...fundraiser,
        ver_document: documents
      };
    }));

    res.status(200).json(processedResults);
  });
});

// Serve static files from the 'uploads' directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Update approval status
app.put("/fundraisers/:id/approve", (req, res) => {
  const { id } = req.params;
  const { approved } = req.body;
  const sql = "UPDATE fundraisers SET approval = ? WHERE id = ?";
  db.query(sql, [approved, id], (err, result) => {
    if (err) {
      return res.status(500).json({ error: "Database error" });
    }
    res.status(200).json({ message: "Approval status updated" });
  });
});

//   CAMPAIGNSSSSS
//Create campaign
const imgstorage = multer.memoryStorage();
const imgupload = multer({ storage: imgstorage });

app.post("/createCampaign", imgupload.single("image"), (req, res) => {
  const {
    fundraiserid,
    walletAddress,
    title,
    description,
    risk,
    target,
    deadline,
    numberOfInvestors,
    rewards,
    updates,
    location,
  } = req.body;

  const image = req.file ? req.file.buffer : null;

  const query = `INSERT INTO campaigns (fundraiser_id, title, description, risk, wallet_address, target, deadline, investors_num, rewards, updates, image, location) VALUES (?)`;
  const values = [
    fundraiserid,
    title,
    description,
    risk,
    walletAddress,
    target,
    deadline,
    numberOfInvestors,
    JSON.stringify(rewards),
    updates,
    image,
    location,
  ];

  //Execute query to inset data
// Insert data into campaigns table
db.query(query, [values], (err, insertResults) => {
  if (err) {
    console.error("Error inserting data into campaigns table:", err);
    res.status(500).send("Internal server error");
    return;
  }

  // Get the inserted row's ID
  const insertedId = insertResults.insertId;

  // Now retrieve the campaign_id using the insertedId
  const getCampaignIdQuery = 'SELECT campaign_id FROM campaigns WHERE id = ?';
  db.query(getCampaignIdQuery, [insertedId], (err, selectResults) => {
    if (err) {
      console.error("Error retrieving campaign ID:", err);
      res.status(500).send("Internal server error");
      return;
    }

    if (selectResults.length > 0) {
      const campaignId = selectResults[0].campaign_id;
      res.status(201).send({ message: "Campaign created successfully", campaign_id: campaignId });
    } else {
      res.status(404).send("Campaign not found");
    }
  });
});
});


//Fund campaign
app.post('/fundCampaign', (req, res) => {
  const { campaign_id, amount } = req.body;
  
  if (!campaign_id || !amount) {
    return res.status(400).json({ error: 'Missing campaign_id or amount' });
  }

  const query = `
    UPDATE campaigns 
    SET collected = collected + ?, investors_num = investors_num + 1 
    WHERE campaign_id = ?
  `;

  db.query(query, [amount, campaign_id], (err, result) => {
    if (err) {
      console.error('Error updating campaign:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json({ message: 'Campaign updated successfully' });
  });
});


//Get All Campaign
app.get("/getCampaigns", (req, res) => {
  const query =
    "SELECT campaign_id, title, deadline,description, target, collected, image FROM campaigns";

  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching campaigns:", err);
      res.status(500).json({ error: "Internal server error" });
      return;
    }

    // Convert buffer to base64
    const campaigns = results.map((campaign) => {
      let base64Image = null;
      if (campaign.image) {
        base64Image = `data:image/jpeg;base64,${Buffer.from(
          campaign.image
        ).toString("base64")}`;
      }
      return {
        ...campaign,
        image: base64Image,
      };
    });

    res.json(campaigns);
  });
});

// Endpoint to get campaign details by event_id
app.get('/campaigns/:campaign_id', (req, res) => {
  const query = 'SELECT * FROM campaign_fundraiser_view WHERE campaign_id = ?'; //Get from view table
  const campaign_id = req.params.campaign_id;

  db.query(query, [campaign_id], (err, results) => {
    if (err) {
      console.error('Error executing query:', err);
      res.status(500).send('Internal Server Error');
      return;
    }

    if (results.length > 0) {
      const campaign = results[0];
      if (campaign.image) {
        campaign.image = `data:image/jpeg;base64,${campaign.image.toString('base64')}`;
      }
      try {
        campaign.rewards = JSON.parse(campaign.rewards);
      } catch (e) {
        console.error('Error parsing rewards JSON:', e);
        campaign.rewards = [];
      }
      res.json(campaign);
    } else {
      res.status(404).send('Item not found');
    }
  });
});



app.post('/updateCampaign', async (req, res) => {
  const { campaignId, updateDate, description } = req.body;
  const selectQuery = 'SELECT updates FROM campaigns WHERE campaign_id = ?';
  const updateQuery = 'UPDATE campaigns SET updates = ? WHERE campaign_id = ?';

  console.log("Data to be updated:", updateDate, description);

  if (!campaignId || !updateDate || !description) {
      return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
      // First, get the current updates
      db.query(selectQuery, [campaignId], (err, results) => {
          if (err) {
              console.error('Error executing select query:', err);
              return res.status(500).send('Internal Server Error');
          }

          let updates = [];
          if (results.length > 0 && results[0].updates) {
              updates = JSON.parse(results[0].updates);
          }

          // Add new update to the array
          updates.push({ date: updateDate, description: description });

          // Convert updates array back to JSON string
          const updatedJSON = JSON.stringify(updates);

          // Update the database with new updates
          db.query(updateQuery, [updatedJSON, campaignId], (updateErr, updateResult) => {
              if (updateErr) {
                  console.error('Error executing update query:', updateErr);
                  return res.status(500).send('Internal Server Error');
              }

              res.status(200).json({ message: 'Campaign updated successfully' });
          });
      });
  } catch (error) {
      console.error('Error in updateCampaign:', error);
      res.status(500).send('Internal Server Error');
  }
});

