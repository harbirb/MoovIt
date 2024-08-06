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

app.use(express.static(path.resolve(__dirname, '../public')))
app.use(express.json())

app.use(session({
    store: MongoStore.create({mongoUrl: MONGODB_URI}),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true
  }));

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

// not used
function authenticate(req, res, next) {
    if (req.session.stravaTokenInfo.athlete_id || req.path == "/") {
        next();
    }
    res.status(401).json({ message: 'Unauthorized' });
}

app.get('/', async (req, res) => {
    res.sendFile(path.resolve(__dirname, "../public/home.html"))
})

app.get('/recentlyPlayed', async (req, res) => {
    res.sendFile(path.resolve(__dirname, "../public/showSongs.html"))
})

app.get('/authStatus', (req, res) => {
    res.send({
        spotify: req.session.spotifyLinked,
        strava: req.session.stravaLinked
    })
})

// not used
app.get("/current", async (req, res) => {
    const spotify_token = await getSpotifyToken(req)
    const currentSong = await axios.get("https://api.spotify.com/v1/me/player/currently-playing", {
        headers: {
            Authorization: "Bearer " + spotify_token
        }
    })
    console.log(currentSong.data.item.name)
})


app.get('/profile', (req, res) => {
    if (req.isAuthenticated) {
        // res.send(`welcome to your profile, strava ${req.session.athlete_id}`)
        res.sendFile(path.resolve(__dirname, "public/profile.html"))

    }
    else {
        res.status(401).send("Unauthorized")
    }
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
        // TODO: delete line below
        req.session.stravaTokenInfo = {access_token, refresh_token, expires_at, athlete_id}
        req.session.athlete_id = athlete_id
        try {
            const user = await User.findOneAndUpdate(
                {athlete_id: athlete_id},
                {$set: {
                    isSubscribed: false,
                    stravaAccessToken: access_token,
                    stravaRefreshToken: refresh_token,
                    stravaTokenExpiresAt: expires_at
                }},
                {new: true,
                    upsert: true,
                    runValidators: true
                }
            )
            console.log("user upserted successfully", user)
        } catch {
            console.log("error upserting user")
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
                    expires_at: expires_at}
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
app.get("/recent_activity", async (req, res) => {
    // get activities in the last week
    const strava_token = await getStravaToken(req.session.athlete_id)
    const spotify_token = await getSpotifyToken(req.session.athlete_id)
    try {
        const recentActivities = await axios.get("https://www.strava.com/api/v3/athlete/activities", {
            params: {
                before: Date.now() /1000,
                after: (Date.now()- 14 * 24 * 60 * 60 *1000 ) / 1000
            }, 
            headers: {
                'Authorization': 'Bearer ' + strava_token
            }
    })
        const activityPromises = recentActivities.data.map(async (activity) => {
            const {name, distance, start_date, elapsed_time} = activity
            const start_time = new Date(start_date).getTime()
            let end_time = start_time + elapsed_time * 1000
            const songsAfterStart = await axios.get("https://api.spotify.com/v1/me/player/recently-played", {
                params: {
                    limit: 50,
                    after: start_time
                },
                headers: {
                    Authorization: "Bearer " + spotify_token
                }
            })
            const songsBeforeEnd = await axios.get("https://api.spotify.com/v1/me/player/recently-played", {
                params: {
                    limit: 50,
                    before: end_time
                },
                headers: {
                    Authorization: "Bearer " + spotify_token
                }
            })
            const songSet = new Set(songsAfterStart.data.items.map(obj => obj.played_at))
            const songsDuringActivity = songsBeforeEnd.data.items.filter(obj => songSet.has(obj.played_at))
            let playList = songsDuringActivity.map(obj => {
                return `${obj.track.name} - ${obj.track.artists.map(artist => artist.name).join(", ")}`
            })
            return {name, distance, start_date, playList}
        })
        let activityPlaylistArray = await Promise.all(activityPromises)
        res.send(activityPlaylistArray)
    } catch (error) {
        console.log(error)
    }    
})


// returns a valid access token for strava api
async function getStravaToken(athlete_id) {
    const user = await User.findOne({athlete_id: athlete_id})
    if (Date.now() > user.stravaTokenExpiresAt * 1000) {
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
    const user = await findOne({athlete_id: athlete_id})
    if (Date.now() > user.spotifyTokenExpiresAt * 1000) {
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
                return access_token
            } else {
                throw new Error("invalid response")
            }
        } catch (error) {
            console.log(error.response.data)
        }
    } else {
        return oldTokenInfo.access_token
    }
}

// Event data is sent here
app.post('/webhook', (req, res) => {
    console.log("webhook event received!", req.body)
    const {object_type, object_id, aspect_type, owner_id, subscription_id, event_time, updates} = req.body
    res.status(200).send('EVENT_RECEIVED')
    if (isAthleteSubscribed(owner_id) && object_type == 'activity' && aspect_type == 'create') {
        // call a function to post songs to the users activity description
        postSongsToActivity()
    }
})

// returns true if the athlete is subscribed (songs automatically posted to their activity)
async function isAthleteSubscribed(athlete_id) {
    const user = await User.findOne({athlete_id: athlete_id})
    return user.isSubscribed
}

function postSongsToActivity(activity_id, athlete_id) {
    // rewrite token handling to use database instead of session store
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


// POST https://www.strava.com/api/v3/push_subscriptions \
//       -F client_id=130385 \
//       -F client_secret=66d8b2e39cdc5e7be642de362690ec6ea9950eea \
//       -F callback_url=https://strava-app-elid.onrender.com/webhook \
//       -F verify_token=STRAVA
// http POST https://www.strava.com/api/v3/push_subscriptions client_id=130385 client_secret=66d8b2e39cdc5e7be642de362690ec6ea9950eea callback_url=https://strava-app-elid.onrender.com/webhook verify_token=STRAVA
// http GET https://www.strava.com/api/v3/push_subscriptions client_id=130385 client_secret=66d8b2e39cdc5e7be642de362690ec6ea9950eea