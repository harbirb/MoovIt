const express = require("express")
const axios = require('axios')
const mongoose = require('mongoose')
const session = require('express-session')
const path = require('path')
const querystring = require("querystring")
const MongoStore = require('connect-mongo')


require('dotenv').config()


const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const MONGODB_URI = process.env.MONGODB_URI
const app = express();

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB Atlas');
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB Atlas', err);
  });

app.use(express.static('public'))
app.use(express.json())

app.use(session({
    store: MongoStore.create({mongoUrl: MONGODB_URI}),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true
  }));

app.use(authenticate);

app.listen(8080, () => {
    console.log("Server is running on port http://localhost:8080")
})



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

app.get('/', (req, res) => {
    if (req.isAuthenticated) {
        res.send("You are signed-in")
    }
    else res.send("not signed in")
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
    const stravaAuthUrl = `http://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&response_type=code&redirect_uri=http://localhost:8080/auth/strava/callback&approval_prompt=auto&scope=read,activity:read_all`
    res.redirect(stravaAuthUrl)
})

// request user authorization from spotify
app.get('/auth/spotify', (req, res) => {
    // var state = generateRandomString(16);
    var scope = 'user-read-private user-read-email user-read-recently-played';
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
        const { access_token, expires_in, refresh_token } = response.data;
        req.session.spotifyTokenInfo = {access_token, refresh_token, expires_at: Math.floor(Date.now()/1000) + expires_in}
        res.send(req.session.spotifyTokenInfo)
    } catch {
        console.error("spotify code doesnt work")
    }
}
)

app.get("/recent_activity", async (req, res) => {
    // get activities in the last week
    const strava_token = req.session.stravaTokenInfo.access_token
    const spotify_token = req.session.spotifyTokenInfo.access_token
    try {
        const response = await axios.get("https://www.strava.com/api/v3/athlete/activities", {
            params: {
                before: Date.now() /1000,
                after: (Date.now()- 7 * 24 * 60 * 60 *1000 ) / 1000
            }, 
            headers: {
                'Authorization': 'Bearer ' + strava_token
            }
    })
        var activity = response.data[0]
        const start_time = new Date(activity.start_date_local).getTime()
        const duration = activity.elapsed_time
        console.log(start_time)
        // res.send(`activity lasted  ${duration}`)
        const songList = await axios.get("https://api.spotify.com/v1/me/player/recently-played", {
            params: {
                limit: 10,
                after: start_time
            },
            headers: {
                Authorization: "Bearer " + spotify_token
            }
        })
        songList.data.items.forEach((obj) => {
            console.log(obj.track.name, obj.played_at)
        })
        res.send(songList.data.items.map(obj => {
            return `${obj.track.name} by ${obj.track.artists.map(artist => artist.name)}`
        }))
    } catch (error) {
        console.log(error)
    }    
})

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
        const { expires_at, refresh_token, access_token, athlete: {id: athlete_id} } = response.data;
        req.session.stravaTokenInfo = {access_token, refresh_token, expires_at, athlete_id}
        res.redirect('/profile')
    }
    catch (error) {
        console.error("strava code doesnt work")
    }
})



