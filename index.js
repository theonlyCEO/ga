require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
const base64 = require("base-64");
const app = express();
const PORT = process.env.PORT || 3000;
const uri = process.env.MONGODB_URI;

app.use(express.json());
app.use(cors({
  origin: [
    "http://localhost:5173", 
    "https://gadget-store-lilac.vercel.app",
"https://gadget-store-git-master-theonlyceos-projects.vercel.app",
"https://gadget-store-q6pkb44wx-theonlyceos-projects.vercel.app"
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));



let client, db;

async function connectToMongo() {
  try {
    client = new MongoClient(uri);
    await client.connect();
    db = client.db("appWorldGadget");
    console.log("Connected to MongoDB:", db.databaseName);
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  }
}

// USERS
app.post("/signup", async (req, res) => {
  try {
    const user = req.body;
    if (!user.password || user.password.length < 8)
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    if (!user.email || !user.email.includes("@"))
      return res.status(400).json({ message: "Invalid email format" });
    if (user.password !== user.confirmPassword)
      return res.status(400).json({ message: "Passwords do not match" });
    
    const existingUser = await db.collection("users").findOne({ email: user.email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use" });
    }
    
    user.password = base64.encode(user.password);
    delete user.confirmPassword;
    
    const result = await db.collection("users").insertOne({
      ...user,
      createdAt: new Date(),
    });
    
    res.status(201).json({
      message: "User created",
      userId: result.insertedId,
      userName: user.userName || user.username,
      email: user.email
    });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.post("/checkpassword", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }
    const user = await db.collection("users").findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const decodedPassword = base64.decode(user.password);
    if (password === decodedPassword) {
      return res.json({
        message: "Password is correct",
        valid: true,
        userName: user.userName || user.username,
        email: user.email,
        userId: user._id
      });
    } else {
      return res.status(401).json({ message: "Invalid password", valid: false });
    }
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid user ID" });
    const user = await db.collection("users").findOne({ _id: new ObjectId(id) });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/users", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: "Email required" });
    const user = await db.collection("users").findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.put("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid user ID" });
    
    let newFields = { ...req.body };
    if (newFields.password) newFields.password = base64.encode(newFields.password);
    
    newFields.updatedAt = new Date();
    
    const result = await db.collection("users").updateOne(
      { _id: new ObjectId(id) },
      { $set: newFields }
    );
    
    if (result.matchedCount === 0) return res.status(404).json({ message: "User not found" });
    
    const updatedUser = await db.collection("users").findOne({ _id: new ObjectId(id) });
    res.json(updatedUser);
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ... your existing imports and connectToMongo ...

// ADD/UPDATE CART ITEM (upsert: add new or update existing)
app.post("/cart/add", async (req, res) => {
  try {
    const { email, product } = req.body; // product: { _id, name, price, imageUrl, quantity }
    if (!email || !product || !product._id) return res.status(400).json({ message: "Email and product required" });

    const existing = await db.collection("cart").findOne({ email, "product._id": product._id });
    if (existing) {
      // Update quantity
      const result = await db.collection("cart").updateOne(
        { _id: existing._id },
        { $inc: { "product.quantity": product.quantity || 1 }, updatedAt: new Date() }
      );
      return res.json({ message: "Cart item updated", result });
    } else {
      // Insert new
      const result = await db.collection("cart").insertOne({
        email,
        product,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      return res.status(201).json({ message: "Cart item added", id: result.insertedId });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// REMOVE CART ITEM
app.delete("/cart/item", async (req, res) => {
  try {
    const { email, productId } = req.body;
    if (!email || !productId) return res.status(400).json({ message: "Email and productId required" });
    const result = await db.collection("cart").deleteOne({ email, "product._id": productId });
    if (result.deletedCount === 0) return res.status(404).json({ message: "Cart item not found" });
    res.json({ message: "Cart item removed" });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// CLEAR USER CART
app.delete("/cart/clear", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });
    await db.collection("cart").deleteMany({ email });
    res.json({ message: "Cart cleared" });
  } catch (e) {
    res.status(500).json({ message: "Error clearing cart" });
  }
});

// GET USER CART (already good)
app.get("/cart", async (req, res) => {
  try {
    if (!req.query.email) return res.status(400).json({ message: "Email required" });
    const carts = await db.collection("cart").find({ email: req.query.email }).toArray();
    // Flatten to array of products
    const items = carts.map(c => c.product);
    res.json(items);
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ORDERS
app.post("/orders", async (req, res) => {
  try {
    const order = req.body;
    if (!order.status) order.status = "Placed";
    
    const result = await db.collection("orders").insertOne({ 
      ...order, 
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    if (order.email) {
      await db.collection("cart").deleteMany({ email: order.email });
    }
    
    res.status(201).json({ message: "Order placed successfully", id: result.insertedId });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/orders", async (req, res) => {
  try {
    if (!req.query.email) return res.status(400).json({ message: "Email required" });
    const orders = await db.collection("orders")
      .find({ email: req.query.email })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(orders);
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// PRODUCTS
app.post("/products", async (req, res) => {
  try {
    const product = req.body;
    if (!product.rating) product.rating = 4.0 + Math.random() * 1;
    if (!product.reviewCount) product.reviewCount = Math.floor(Math.random() * 50) + 5;
    if (!product.stock) product.stock = Math.floor(Math.random() * 20) + 1;
    
    const result = await db.collection("products").insertOne({ 
      ...product, 
      createdAt: new Date() 
    });
    res.status(201).json({ message: "Product added", id: result.insertedId });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// In server.js
app.get("/products", async (req, res) => {
  try {
    const { category, search } = req.query;
    let query = {};
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } }
      ];
    }
    const products = await db.collection("products").find(query).toArray();
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching products" });
  }
});

app.get("/products/:id", async (req, res) => {
  try {
    const product = await db.collection("products").findOne({ _id: req.params.id });
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching product" });
  }
});

app.put("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid ID" });
    const result = await db.collection("products").updateOne(
      { _id: new ObjectId(id) },
      { $set: { ...req.body, updatedAt: new Date() } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ message: "Product not found" });
    res.json({ message: "Product updated" });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.delete("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid ID" });
    const result = await db.collection("products").deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ message: "Product not found" });
    res.json({ message: "Product deleted" });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

connectToMongo().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});