const express = require("express");
const axios = require('axios')
const mongoose = require('mongoose');
const session = require('express-session')
const path = require('path')
const querystring = require("querystring");

require('dotenv').config();


const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

const app = express();

app.use(express.static('public'))
app.use(express.json())

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true
  }));

app.use(authenticate);

app.listen(8080, () => {
    console.log("Server is running on port http://localhost:8080")
})

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB Atlas');
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB Atlas', err);
  });


const tokenSchema = new mongoose.Schema({
    athlete_id: {type: Number, unique: true, index: true},
    access_token: String,
    refresh_token: String,
    expires_in: Number,
    expires_at: Number
})

const Tokens = mongoose.model("Tokens", tokenSchema)

async function storeTokens(athlete_id, access_token, refresh_token, expires_at, expires_in) {
    
    const filter = { athlete_id: athlete_id}
    const update = {access_token: access_token,
                    refresh_token: refresh_token,  
                    expires_at: expires_at,
                    expires_in: expires_in}

    try {
        const savedTokens = await Tokens.findOneAndUpdate(filter, update, {
            new: true, upsert: true
        });
        console.log("saved tokens successfully")
    } catch (error) {
        console.log("error saving tokens", error)        
    }
}

function authenticate(req, res, next) {
    req.isAuthenticated = false
    if (req.session.athlete_id) {
        req.isAuthenticated = true        
    }
    next()
}

app.get("/home", (req, res)=> {
    res.sendFile(path.join(__dirname, "public/home.html"))
})

app.get('/profile', (req, res) => {
    if (req.isAuthenticated) {
        // res.send(`welcome to your profile, strava ${req.session.athlete_id}`)
        res.sendFile(path.join(__dirname, "public/profile.html"))

    }
    else {
        res.status(401).send("Unauthorized")
    }
})

app.get('/auth/strava', (req, res) => {
    const stravaAuthUrl = `http://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&response_type=code&redirect_uri=http://localhost:8080/auth/strava/callback&approval_prompt=auto&scope=read`
    res.redirect(stravaAuthUrl)
})

// request user authorization from spotify
app.get('/auth/spotify', (req, res) => {
    // var state = generateRandomString(16);
    var scope = 'user-read-private user-read-email';
    var state = 'klhgKJFhjdyFBkhfJGHL' 

  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: SPOTIFY_CLIENT_ID,
      scope: scope,
      state: state,
      redirect_uri: 'http://localhost:8080/auth/spotify/callback'
    }));
    
})

app.get('/auth/spotify/callback', async (req, res) => {
    const AUTH_CODE = req.query.code
    if ('error' in req.query) {
        res.send("Error in auth: access denied")
    }
    try {
        const response = await axios.post('https://accounts.spotify.com/api/token', {
            code: AUTH_CODE,
            redirect_uri: 'http://localhost:8080/auth/spotify/callback',
            grant_type: 'authorization_code'
        }, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': 'Basic ' + (new Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64'))
            }
        })
        const { access_token, expires_in, scope, refresh_token } = response.data;
        res.send(response.data)
    } catch {
        console.error("spotify code doesnt work")
    }
}
)


app.get('/auth/strava/callback', async (req, res) => {
    const AUTH_CODE = req.query.code
    if ('error' in req.query) {
        res.send("Error in auth: access denied")
    }
    try {
        const response = await axios.post("https://www.strava.com/oauth/token", {
            client_id: STRAVA_CLIENT_ID,
            client_secret: STRAVA_CLIENT_SECRET,
            code: AUTH_CODE,
            grant_type: 'authorization_code'
        })
        const { expires_at, expires_in, refresh_token, access_token, athlete: {id: athlete_id} } = response.data;
        storeTokens(athlete_id, access_token, refresh_token, expires_at, expires_in)
        req.session.athlete_id = athlete_id;
        res.redirect('/profile')
    }
    catch (error) {
        console.error("strava code doesnt work")
    }
})



