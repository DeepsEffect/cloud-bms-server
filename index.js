const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.SECRECT_KEY);

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://could-mbs.web.app",
      "https://cloud-bms.vercel.app",
      "https://cloud-bms.netlify.app",
    ],
  })
);
app.use(express.json());

// mongodb
const uri = `mongodb+srv://${process.env.DB_NAME}:${process.env.DB_PASS}@cluster0.ctz3uz9.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    //! collections
    const apartmentCollection = client
      .db("cloudDB")
      .collection("apartmentCollection");
    const agreementCollection = client.db("cloudDB").collection("agreements");
    const usersCollection = client.db("cloudDB").collection("users");
    const announcementCollection = client
      .db("cloudDB")
      .collection("announcements");
    const couponCollection = client.db("cloudDB").collection("coupons");
    const paymentCollection = client.db("cloudDB").collection("payments");

    // get the apartment data
    app.get("/apartments", async (req, res) => {
      const result = await apartmentCollection.find().toArray();
      res.send(result);
    });

    // pagination
    app.get("/all-apartments", async (req, res) => {
      const size = parseInt(req.query.size);
      const page = parseInt(req.query.page) - 1;
      // console.log(size, page);
      const result = await apartmentCollection
        .find()
        .skip(page * size)
        .limit(size)
        .toArray();
      res.send(result);
    });
    app.get("/apartments-count", async (req, res) => {
      const count = await apartmentCollection.countDocuments();
      res.send({ count });
    });

    // get announcement data
    app.get("/announcements", async (req, res) => {
      const result = await announcementCollection.find().toArray();
      res.send(result);
    });

    //! user related api
    // save a user data in the db
    app.put("/user", async (req, res) => {
      const user = req.body;
      const query = { email: user?.email };
      // check if the user already in the db
      const isExists = await usersCollection.findOne(query);
      if (isExists) {
        return res.send(isExists);
      }
      // save the user for the first time
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...user,
          timestamp: Date.now(),
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });

    // get a user info from db
    app.get("/user/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email });
      res.send(result);
    });

    // get all the users data
    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    //! agreements related api
    // post agreement data
    app.post("/agreement", async (req, res) => {
      const agreement = req.body;
      const query = { userEmail: agreement.userEmail };
      // Check if the user already has an agreement
      const existingAgreement = await agreementCollection.findOne(query);
      if (existingAgreement) {
        return res.status(400).send({
          message: "You've already made agreement for an apartment",
        });
      }
      const result = await agreementCollection.insertOne(agreement);
      res.send(result);
    });

    // getting agreements data
    app.get("/agreements", async (req, res) => {
      const result = await agreementCollection.find().toArray();
      res.send(result);
    });

    // getting a agreement data by email
    app.get("/agreements/:email", async (req, res) => {
      const email = req.params.email;
      const query = { userEmail: email };
      const result = await agreementCollection.findOne(query);
      res.send(result);
    });

    //! payment related api
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payment", async (req, res) => {
      const payment = req.body;
      const paymentResult = paymentCollection.insertOne(payment);
      const updateResult = agreementCollection.findOneAndUpdate(
        { userEmail: payment.email },
        { $set: { rent: 0 } },
        { returnDocument: "after" }
      );
      res.send(paymentResult, updateResult);
    });

    //! admin related api
    // get all the members data
    app.get("/members", async (req, res) => {
      const query = req.query;
      // console.log(query);
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });

    // removing a member
    app.patch("/members/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "user",
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // check agreement status / handle approve request
    app.patch("/agreements/:id", async (req, res) => {
      const id = req.params.id;
      const email = req.body.userEmail;
      console.log(email);
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: "approved",
          checkedTime: Date.now(),
        },
      };
      const result = await agreementCollection.updateOne(query, updateDoc);
      res.send(result);
      // update the user's role
      const user = await usersCollection.findOneAndUpdate(
        { email: email },
        { $set: { role: "member" } }
      );
    });

    //  reject request related api endpoint
    app.patch("/agreements/:id/reject", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: "rejected",
          rejectedTime: Date.now(),
        },
      };
      const result = await agreementCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // add announcement
    app.post("/announcement", async (req, res) => {
      const content = req.body;
      // console.log(announcement);
      const result = await announcementCollection.insertOne(content);
      res.send(result);
    });

    // add coupon
    app.post("/coupon", async (req, res) => {
      const couponData = req.body;
      const result = await couponCollection.insertOne(couponData);
      res.send(result);
    });

    // get all the coupons
    app.get("/coupons", async (req, res) => {
      const result = await couponCollection.find().toArray();
      res.send(result);
    });

    // delete coupons
    app.delete("/coupon/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await couponCollection.deleteOne(query);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("cloud-mbs is running");
});
app.listen(port, () => {
  console.log(`server is running on port ${port}`);
});
