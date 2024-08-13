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
const BASE_URL = process.env.BASE_URL
const app = express();

mongoose.connect(MONGODB_URI).then(() => {
    console.log('Connected to MongoDB Atlas');
  }).catch((err) => {
    console.error('Failed to connect to MongoDB Atlas', err);
  });

  

// MIDDLEWARE
app.use(session({
    store: MongoStore.create({mongoUrl: MONGODB_URI}),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true
  }));
app.use("/api", authenticate)
app.use(express.static(path.resolve(__dirname, '../public')))
app.use(express.json())

function authenticate(req, res, next) {
    if (req.session && req.session.athlete_id) {
        return next()
    } else {
        return res.redirect('/')
    }
}

app.listen(process.env.PORT, () => {
    console.log(`Server is running on port ${process.env.PORT}`)
})

module.exports = app;

const userSchema = new mongoose.Schema({
    athlete_id: {
        type: Number,
        required: true,
        unique: true
    },
    isSubscribed: {
        type: Boolean,
        required: true
    },
    stravaAccessToken: String,
    stravaRefreshToken: String,
    stravaTokenExpiresAt: Date,
    spotifyAccessToken: String,
    spotifyRefreshToken: String,
    spotifyTokenExpiresAt: Date
})
const User = mongoose.model("User", userSchema)




app.get('/', async (req, res) => {
    res.sendFile(path.resolve(__dirname, "../public/home.html"))
})

app.get('/recentlyPlayed', authenticate, async (req, res) => {
    res.sendFile(path.resolve(__dirname, "../public/showSongs.html"))
})

app.get('/authStatus', (req, res) => {
    res.send({
        spotify: req.session.spotifyLinked,
        strava: req.session.stravaLinked
    })
})

// not used
app.get("/api/first50/:time", async (req, res) => {
    const spotifyAccessToken = await getSpotifyToken(req.session.athlete_id)
    console.log(spotifyAccessToken)
    const end_time = req.params.time
    const songsBeforeEndResponse = await fetch(`https://api.spotify.com/v1/me/player/recently-played?limit=50&after=${end_time}`, {
        method: 'GET',
        headers: {
            'Authorization': 'Bearer ' + spotifyAccessToken
        }
    })
    const songsBeforeEnd = await songsBeforeEndResponse.json()
    console.log(songsBeforeEnd)
    res.send(songsBeforeEnd.items.map(obj => obj.track.name))
})

app.get("/api/current-song", async (req, res) => {
    const spotifyAccessToken = await getSpotifyToken(req.session.athlete_id)
    const currentSongResponse = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${spotifyAccessToken}`,
        'Content-Type': 'application/json'
      }
    })
    const currentSong = await currentSongResponse.json()
    res.send(currentSong)
})

app.get('/api/testpage/:activity', async (req, res) => {
    const playlist = await getSongsByActivity(req.session.athlete_id, req.params.activity)
    res.send(playlist)
})

app.get('/auth/strava', (req, res) => {
    const stravaAuthUrl = `http://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${BASE_URL}/auth/strava/callback&approval_prompt=auto&scope=read,activity:read_all,activity:write`
    res.redirect(stravaAuthUrl)
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
        req.session.athlete_id = athlete_id
        try {
            const user = await User.findOne({athlete_id: athlete_id})
            if (user == null) {
                const newUser = new User({
                    athlete_id: athlete_id,
                    isSubscribed: false,
                    stravaAccessToken: access_token,
                    stravaRefreshToken: refresh_token,
                    stravaTokenExpiresAt: expires_at
                })
                await newUser.save()
                console.log("created a new user")
            } else {
                user.stravaAccessToken = access_token
                user.stravaRefreshToken = refresh_token
                user.stravaTokenExpiresAt = expires_at
                await user.save()
                console.log("updated existing user")
            }
        } catch {
            console.log("error updating user")
        }
        req.session.stravaLinked = true
        res.redirect('/')
    }
    catch (error) {
        console.error("Error in strava auth step", (error))
    }
})

// request user authorization from spotify
app.get('/auth/spotify', (req, res) => {
    // var state = generateRandomString(16);
    var scope = 'user-read-private user-read-email user-read-recently-played user-read-currently-playing';
    var state = 'klhgKJFhjdyFBkhfJGHL' 

  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: SPOTIFY_CLIENT_ID,
      scope: scope,
      state: state,
      redirect_uri: `${BASE_URL}/auth/spotify/callback`
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
            redirect_uri: `${BASE_URL}/auth/spotify/callback`,
            grant_type: 'authorization_code'
        }, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': 'Basic ' + (new Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64'))
            }
        })
        const { access_token, expires_in, refresh_token } = response.data;
        const expires_at = Math.floor(Date.now()/1000) + expires_in
        // TODO: delete below line after fixing token handler
        req.session.spotifyTokenInfo = {access_token, refresh_token, expires_at: Math.floor(Date.now()/1000) + expires_in}
        try {
            const user = await User.findOneAndUpdate(
                {athlete_id: req.session.athlete_id},
                {$set: {
                    spotifyAccessToken: access_token,
                    spotifyRefreshToken: refresh_token,
                    spotifyTokenExpiresAt: expires_at}
                },
                {new: true, runValidators: true}
            )
            console.log("Linked spotify to this user", user)
        } catch (error) {
            console.log("error updating user", error)
        }
        req.session.spotifyLinked = true
        res.redirect('/')
    } catch (error) {
        console.error("Error in Spotify Auth Step", error)
    }
}
)

// DATA SAVER MUST BE TURNED OFF IN APP SETTINGS
// IN PHONE SETTINGS, ALLOW BACKGROUND DATA USAGE FOR SPOTIFY
app.get("/api/recent-activities", async (req, res) => {
    // get activities in the last week
    const athlete_id = req.session.athlete_id
    const strava_token = await getStravaToken(athlete_id)
    try {
        const recentActivities = await axios.get("https://www.strava.com/api/v3/athlete/activities", {
            params: {
                before: Date.now() /1000,
                after: (Date.now()- 7 * 24 * 60 * 60 *1000 ) / 1000
            }, 
            headers: {
                'Authorization': 'Bearer ' + strava_token
            }
        })
        // only show 5 recent activities
        const recentActivitiesList = recentActivities.data.slice(0, 5)        
        
        // get the playlist associated with each activity
        const activityPromises = recentActivitiesList.map(async (activity) => {
            const {name, distance, start_date_local, id: activity_id} = activity            
            const playlist = await getSongsByActivity(req.session.athlete_id, activity_id)
            return {name, distance, start_date_local, playlist, activity_id}
        })
        let activityPlaylistArray = await Promise.all(activityPromises)
        res.send(activityPlaylistArray)
    } catch (error) {
        console.log(error)
    }    
})

app.get("/api/user/isSubscribed", async (req, res) => {
    try {
        const isSubscribed = await isAthleteSubscribed(req.session.athlete_id)
        res.status(200).send(isSubscribed)
    } catch (error) {
        console.log("error checking subscription status", error)
        res.status(500).send("internal server error")
    }
})

app.post("/api/user/toggleIsSubscribed", async (req, res) => {
    try {
        const {newSubscriptionStatus} = req.body
        console.log("new status is", newSubscriptionStatus)
        const result = await User.updateOne(
            {athlete_id: req.session.athlete_id},
            {$set: {
                    isSubscribed: newSubscriptionStatus
                }
            }
        )
        if (result.nModified === 0) {
            return res.status(404).json({ message: 'User not found or no change in subscription status' })
        }
        res.status(200).send({ message: "updated subscription successfully" })
    } catch (error) {
        console.log("Error in updating user's subscription", error)
    }
})

// returns a valid access token for strava api
async function getStravaToken(athlete_id) {
    console.log("getting token for athlete :", athlete_id)
    const user = await User.findOne({athlete_id: athlete_id})    
    if (Date.now() > user.stravaTokenExpiresAt * 1000) {
        console.log("strava token expired, getting new one")
        try {
            const response = await axios.post('https://www.strava.com/oauth/token', {
                client_id: STRAVA_CLIENT_ID,
                client_secret: STRAVA_CLIENT_SECRET,
                grant_type: "refresh_token",
                refresh_token: user.stravaRefreshToken
            })
            if (response.data.access_token) {
                const {access_token, refresh_token, expires_at} = response.data
                try {
                    await User.updateOne(
                        {athlete_id: athlete_id},
                        {$set: {
                            stravaAccessToken: access_token,
                            stravaRefreshToken: refresh_token,
                            stravaTokenExpiresAt: expires_at
                        }}
                    )
                    console.log("updated strava token data")
                } catch (error) {
                    console.log("error updating user's strava token data", error)
                }
                return access_token
            } else {
                throw new Error("invalid response")
            }
        } catch (error) {
            console.log(error)
        }        
    } else {
        return user.stravaAccessToken
    }
}

// returns a valid access token for spotify api
// spotify api does not return a new refresh token, keep using same refresh token
async function getSpotifyToken(athlete_id) {
    console.log("getting token for athlete :", athlete_id)
    const user = await User.findOne({athlete_id: athlete_id})
    if (Date.now() > user.spotifyTokenExpiresAt * 1000) {
        console.log("spotify token expired, getting new one")
        try {
            const response = await axios.post("https://accounts.spotify.com/api/token", {
                grant_type: "refresh_token",
                refresh_token: user.spotifyRefreshToken
            }, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + (new Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64'))
                }
            })
            if (response.data.access_token) {
                const {access_token, expires_in} = response.data
                const expires_at = Math.floor(Date.now()/1000) + expires_in
                try {
                    await User.updateOne(
                        {athlete_id: athlete_id},
                        {$set: {
                            spotifyAccessToken: access_token,
                            spotifyTokenExpiresAt: expires_at
                        }}
                    )
                    console.log("updated spotify token data")
                } catch (error) {
                    console.log("error updating user's spotify token data", error)
                }
                console.log("Returned new access token!")
                return access_token
            } else {
                console.log("could not get new access_token")
            }
        } catch (error) {
            console.log("error in getting spotify token", error.response.data)
        }
    } else {
        return user.spotifyAccessToken
    }
}

// Event data is sent here
app.post('/webhook', async (req, res) => {
    console.log("webhook event received!", req.body)
    const {object_type, object_id, aspect_type, owner_id} = req.body
    res.status(200).send('EVENT_RECEIVED')
    if (await isAthleteSubscribed(owner_id) && object_type == 'activity' && aspect_type == 'create') {
        // call a function to post songs to the users activity description
        postToActivity(owner_id, object_id)
    }
})

// returns true if the athlete is subscribed (songs automatically posted to their activity)
async function isAthleteSubscribed(athlete_id) {
    const user = await User.findOne({athlete_id: athlete_id})
    return user.isSubscribed
}



async function postToActivity(athlete_id, activity_id) {
    try {
        const songArray = await getSongsByActivity(athlete_id, activity_id)
        if (songArray.length == 0) {
            return
        }
        const songString = songArray.join('\n')
        const stravaAccessToken = await getStravaToken(athlete_id)
        let activityDescription = songString + '\n' + "- MoovIt 🐮"
        const response = await fetch(`https://www.strava.com/api/v3/activities/${activity_id}`, {
            method: "PUT",
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + stravaAccessToken
            },
            body: JSON.stringify({
                description: activityDescription
            })
        })
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`)
        }
    } catch (error) {
        console.log("error", error)
    }
}

async function getSongsByActivity(athlete_id, activity_id) {
    try {
        stravaAccessToken = await getStravaToken(athlete_id)
        spotifyAccessToken = await getSpotifyToken(athlete_id)
        const activity = await fetch(`https://www.strava.com/api/v3/activities/${activity_id}?include_all_efforts=false`, {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + stravaAccessToken
            }
        })
        const {start_date, elapsed_time} = await activity.json()
        const start_time = new Date(start_date).getTime()
        const end_time = start_time + elapsed_time * 1000
        const songsAfterStartResponse = await fetch(`https://api.spotify.com/v1/me/player/recently-played?limit=50&after=${start_time}`, {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + spotifyAccessToken
            }
        })
        const songsAfterStart = await songsAfterStartResponse.json()
        const songsBeforeEndResponse = await fetch(`https://api.spotify.com/v1/me/player/recently-played?limit=50&before=${end_time}`, {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + spotifyAccessToken
            }
        })
        const songsBeforeEnd = await songsBeforeEndResponse.json()
        const songSet = new Set(songsBeforeEnd.items.map(obj => obj.played_at))
        const songsDuringActivity = songsAfterStart.items.filter(obj => songSet.has(obj.played_at))
        let activityPlaylist = songsDuringActivity.map(obj => {
            return `${obj.track.name} - ${obj.track.artists.map(artist => artist.name).join(", ")}`
        })
        return activityPlaylist.reverse()
    } catch (error) {
        console.log("Error", error)
    }
}

// Validates the callback address
app.get('/webhook', (req, res) => {
    console.log("subscription validation request received", req.query)
    const challenge = req.query['hub.challenge']
    const verify_token = req.query['hub.verify_token']
    if (verify_token == "STRAVA") {
        res.status(200).send({"hub.challenge": challenge})
    }
    else res.status(403)    
    console.log(challenge)
})
