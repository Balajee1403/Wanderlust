const express = require("express");
const app = express();
const mongoose = require("mongoose");
const Listing = require("./models/listing.js");
const User = require("./models/user.js");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const wrapAsync = require("./utils/wrapAsync.js");
const ExpressError = require("./utils/ExpressError.js");
const { listingSchema } = require("./schema.js");

const MONGO_URL = "mongodb://127.0.0.1:27017/wanderlust";

main()
    .then(() => {
        console.log("connected to DB");
    })
    .catch((err) => {
        console.log(err);
    });

async function main() {
    await mongoose.connect(MONGO_URL);
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: "wanderlust-secret",
    resave: false,
    saveUninitialized: false,
}));
app.use(async (req, res, next) => {

    if (req.session.userId) {
        res.locals.currentUser = await User.findById(req.session.userId);
    } else {
        res.locals.currentUser = null;
    }

    next();
});

app.use(methodOverride("_method"));
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.send("Hi, i am root");
});

const validateListing = (req, res, next) => {  //func which convert it to middleware
    let { error } = listingSchema.validate(req.body);
    if (error) {
        let errMsg = error.details.map((el) => el.message).join(",");
        throw new ExpressError(400, errMsg);
    } else {
        next();
    }
};

// Signup page
app.get("/signup", (req, res) => {
    res.render("users/signup.ejs");
});

// Signup
app.post("/signup", wrapAsync(async (req, res) => {

    let { username, email, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 12);

    const newUser = new User({
        username,
        email,
        password: hashedPassword,
    });

    await newUser.save();

    req.session.userId = newUser._id;

    res.redirect("/listings");
}));

// Login page
app.get("/login", (req, res) => {
    res.render("users/login.ejs");
});

// Login
app.post("/login", wrapAsync(async (req, res) => {

    let { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
        return res.send("Invalid email or password");
    }

    const validPassword = await bcrypt.compare(
        password,
        user.password
    );

    if (!validPassword) {
        return res.send("Invalid email or password");
    }

    req.session.userId = user._id;

    res.redirect("/listings");
}));

app.get("/logout", (req, res) => {

    req.session.destroy((err) => {

        if (err) {
            return res.send("Unable to logout");
        }

        res.redirect("/listings");
    });
});

//index route
app.get("/listings", wrapAsync(async (req, res) => {
    let { search } = req.query;

    let allListings;

    if (search) {
        if (!isNaN(search)) {

            let price = Number(search);

            allListings = await Listing.find({
                price: {
                    $gte: price - 1000,
                    $lte: price + 1000
                }
            });

        } else {

            allListings = await Listing.find({
                $or: [
                    { title: { $regex: search, $options: "i" } },
                    { description: { $regex: search, $options: "i" } },
                    { location: { $regex: search, $options: "i" } },
                    { country: { $regex: search, $options: "i" } }
                ]
            });

        }
    } else {
        allListings = await Listing.find({});
    }

    res.render("listings/index.ejs", { allListings });
}));

//new route
app.get("/listings/new", (req, res) => {
    res.render("listings/new.ejs");
});

//show route
app.get("/listings/:id", wrapAsync(async (req, res) => {
    let { id } = req.params;
    const listing = await Listing.findById(id);
    res.render("listings/show.ejs", { listing });
}));

//create route
app.post(
    "/listings",
    validateListing,
    wrapAsync(async (req, res, next) => {
        let result = listingSchema.validate(req.body);
        console.log(result);
        if (result.error) {
            throw new ExpressError(400, result.error);
        }
        const newListing = new Listing(req.body.listing);
        await newListing.save();
        res.redirect("/listings");
    })
);

//Edit Route
app.get("/listings/:id/edit", wrapAsync(async (req, res) => {
    let { id } = req.params;
    const listing = await Listing.findById(id);
    res.render("listings/edit.ejs", { listing });
}));

//Update Route 
app.put("/listings/:id",
    validateListing,
    wrapAsync(async (req, res) => {
        let { id } = req.params;
        await Listing.findByIdAndUpdate(id, { ...req.body.listing });
        res.redirect(`/listings/${id}`);
    }));

//Delete Route 
app.delete("/listings/:id", wrapAsync(async (req, res) => {
    let { id } = req.params;
    let deletedListing = await Listing.findByIdAndDelete(id);
    console.log(deletedListing);
    res.redirect("/listings");
}));

// app.get("/testListings", async (req, res) => {
//     let sampleListing = new Listing({
//         title: "My new villa",
//         description: "By the beach",
//         price: 1200,
//         location: "calangute, goa",
//         country: "India",
//     });

//     await sampleListing.save();
//     console.log("sample was saved");
//     res.send("successful testing");
// });

// app.use((err, req, res, next) => { //middleware for error handling
//     res.send("something went wrong!");
// });

app.all("/*splat", (req, res, next) => {
    next(new ExpressError(404, "page not found!"));
});

app.use((err, req, res, next) => {
    let { statusCode = 500, message = "Something went wrong!" } = err;
    res.status(statusCode).render("error.ejs", { message });
    // res.status(statusCode).send(message);
});

app.listen(8080, () => {
    console.log("server is running on port 8080");
});