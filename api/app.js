const express = require("express")
const axios = require('axios')
const mongoose = require('mongoose')
const session = require('express-session')
const path = require('path')
const querystring = require("querystring")
const MongoStore = require('connect-mongo')
require('dotenv').config()

const {
    STRAVA_CLIENT_ID,
    STRAVA_CLIENT_SECRET,
    SPOTIFY_CLIENT_ID,
    SPOTIFY_CLIENT_SECRET,
    MONGODB_URI,
    BASE_URL,
    SESSION_SECRET
} = process.env;

const app = express();
const PORT = process.env.PORT || 3000;

mongoose.connect(MONGODB_URI)
    .then(() => console.log('Connected to MongoDB Atlas'))
    .catch((err) => console.error('Failed to connect to MongoDB Atlas', err));

const sessionStore = MongoStore.create({
    mongoUrl: MONGODB_URI,
    collectionName: 'sessions',
    ttl: 24 * 60 * 60 * 7 // 7 days
});

// MIDDLEWARE
app.use(session({
    store: sessionStore,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 * 7 // 7 days
    }
}));

app.use("/api", authenticate)
app.use(express.static(path.resolve(__dirname, '../public')))
app.use(express.json())

app.listen(PORT, () => console.log(`Server is running on port ${PORT}`))

// Authentication Middleware
function authenticate(req, res, next) {
    if (req.session && req.session.athlete_id) {
        return next();
    }
    return res.redirect('/');
}

// Database Models
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
    spotifyTokenExpiresAt: Date,
    spotifyEmail: String
})
const User = mongoose.model("User", userSchema)

const activitySoundtrackSchema = new mongoose.Schema({
    activity_id: Number,
    athlete_id: Number,
    tracks: [{
        track_name: String,
        track_artists: [String],
        link: String
    }]
})
const ActivitySoundtrack = mongoose.model("ActivitySoundtrack", activitySoundtrackSchema)



app.get('/', async (req, res) => {
    res.sendFile(path.resolve(__dirname, "../public/home.html"))
})

app.get('/recently-played', authenticate, async (req, res) => {
    res.sendFile(path.resolve(__dirname, "../public/showSongs.html"))
})

app.get('/auth-status', (req, res) => {
    res.send({
        spotify: !!req.session.spotifyLinked,
        strava: !!req.session.stravaLinked
    })
})

// For testing only
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

// For testing only
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

// For testing only
app.get('/api/testpage/:activity', async (req, res) => {
    const soundtrack = await getActivitySoundtrack(req.session.athlete_id, req.params.activity)
    res.send(soundtrack)
})

app.get('/auth/strava', (req, res) => {
    const stravaAuthUrl = `http://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${BASE_URL}/auth/strava/callback&approval_prompt=auto&scope=read,activity:read_all,activity:write`
    res.redirect(stravaAuthUrl)
})


async function exchangeStravaAuthCodeForTokens(authCode) {
    const response = await axios.post("https://www.strava.com/oauth/token", {
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        code: authCode,
        grant_type: 'authorization_code'
    })
    const { expires_at, refresh_token, access_token, athlete: { id: athlete_id } } = response.data
    return { expires_at, refresh_token, access_token, athlete_id }
}

async function updateOrCreateUser(session, athlete_id, tokenData) {
    const { expires_at, refresh_token, access_token } = tokenData
    const user = await User.findOne({ athlete_id: athlete_id })
    if (!user) {
        const newUser = new User({
            athlete_id: athlete_id,
            isSubscribed: false,
            stravaAccessToken: access_token,
            stravaRefreshToken: refresh_token,
            stravaTokenExpiresAt: expires_at
        })
        await newUser.save();
        console.log("Created a new user");
    } else {
        user.stravaAccessToken = access_token
        user.stravaRefreshToken = refresh_token
        user.stravaTokenExpiresAt = expires_at
        if (user.spotifyEmail) {
            session.spotifyLinked = true;
        }
        await user.save();
        console.log("Updated existing user");
    }
}

app.get('/auth/strava/callback', async (req, res) => {
    const { code: AUTH_CODE, error } = req.query
    if (error) {
        return res.redirect('/')
    }
    try {
        const { athlete_id, ...tokenData } = await exchangeStravaAuthCodeForTokens(AUTH_CODE)
        await updateOrCreateUser(req.session, athlete_id, tokenData)

        req.session.athlete_id = athlete_id
        req.session.stravaLinked = true
        res.redirect('/')
    }
    catch (error) {
        console.error("Error in Strava auth step", error)
        res.status(500).send("Authentication failed")
    }
})

app.get('/auth/spotify', (req, res) => {
    const scope = 'user-read-private user-read-email user-read-recently-played'
    const state = 'klhgKJFhjdyFBkhfJGHL' 

  res.redirect('https://accounts.spotify.com/authorize?' + querystring.stringify({
      response_type: 'code',
      client_id: SPOTIFY_CLIENT_ID,
      scope,
      state,
      redirect_uri: `${BASE_URL}/auth/spotify/callback`
    }))
    
})

async function exchangeSpotifyAuthCodeForTokens(authCode) {
    const response = await axios.post('https://accounts.spotify.com/api/token', {
        code: authCode,
        redirect_uri: `${BASE_URL}/auth/spotify/callback`,
        grant_type: 'authorization_code'
    }, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + (new Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64'))
        }
    })
    return response.data
}

async function fetchUserProfileData(accessToken) {
    const response = await fetch('https://api.spotify.com/v1/me', {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    })
    return response.json()
}

async function updateUserWithSpotifyData(athlete_id, data) {
    const user = await User.findOneAndUpdate(
        { athlete_id: athlete_id },
        { $set: data },
        { new: true, runValidators: true }
    )
    console.log("Linked spotify to user:", user.athlete_id)
}

app.get('/auth/spotify/callback', async (req, res) => {
    const { code: AUTH_CODE, error } = req.query
    if (error) {
        return res.redirect('/')
    }
    try {
        const { access_token, refresh_token, expires_in } = await exchangeSpotifyAuthCodeForTokens(AUTH_CODE)
        const expires_at = Math.floor(Date.now()/1000) + expires_in
        const userProfile = await fetchUserProfileData(access_token)
        await updateUserWithSpotifyData(req.session.athlete_id, {
            spotifyAccessToken: access_token,
            spotifyRefreshToken: refresh_token,
            spotifyTokenExpiresAt: expires_at,
            spotifyEmail: userProfile.email
        })
        req.session.spotifyLinked = true
        res.redirect('/')
    } catch (error) {
        console.error("Error in Spotify Auth Step", error)
        res.status(500).send("Authentication failed")
    }
})

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
            const soundtrack = await getActivitySoundtrack(req.session.athlete_id, activity_id)
            return {name, distance, start_date_local, soundtrack, activity_id}
        })
        let activitySoundtrackArray = await Promise.all(activityPromises)
        res.send(activitySoundtrackArray)
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
        res.status(500).send("Internal server error")
    }
})

async function updateUserSubscriptionStatus(athlete_id, newStatus) {
    return User.updateOne(
        { athlete_id: athlete_id },
        { $set: { isSubscribed: newStatus } }
    )
}

app.post("/api/user/toggleIsSubscribed", async (req, res) => {
    try {
        const {newSubscriptionStatus} = req.body
        console.log("new status is", newSubscriptionStatus)
        const result = await updateUserSubscriptionStatus(req.session.athlete_id, newSubscriptionStatus)
        if (result.nModified === 0) {
            return res.status(404).json({ message: 'User not found or no change in subscription status' })
        }
        res.status(200).send({ message: "updated subscription successfully" })
    } catch (error) {
        console.error("Error in updating user's subscription", error)
    }
})

// Calls Strava API to refresh tokens
async function refreshStravaTokens(refreshToken) {
    const response = await axios.post('https://www.strava.com/oauth/token', {
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshToken
    })
    if (!response.data.access_token) {
        throw new Error("Invalid response from Strava API")
    }
    return response.data
}

// Stores updated Strava tokens in DB
async function updateUserStravaTokens(athlete_id, access_token, refresh_token, expires_at) {
    try {
        await User.updateOne(
            {athlete_id: athlete_id},
            {$set: {
                stravaAccessToken: access_token,
                stravaRefreshToken: refresh_token,
                stravaTokenExpiresAt: expires_at
            }}
        )
        console.log("Updated Strava token data")
    } catch (error) {
        console.error("Error updating user's Strava token data", error)
        throw error
    }
}

// Returns a valid Strava access token
async function getStravaToken(athlete_id) {
    console.log("Getting token for athlete :", athlete_id)
    const user = await User.findOne({athlete_id: athlete_id}) 
    if (!user) {
        throw new Error("User not found")
    }
    if (Date.now() <= user.stravaTokenExpiresAt * 1000) {
        return user.stravaAccessToken
    }
    console.log("Strava token expired, getting new one")
    try {
        const {access_token, refresh_token, expires_at} = await refreshStravaTokens(refresh_token)
        await updateUserStravaTokens(athlete_id, access_token, refresh_token, expires_at)
        return access_token
    } catch (error) {
        console.log("Error in getting Strava token")
        throw error
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
        const soundtrack = await getActivitySoundtrack(athlete_id, activity_id)
        if (soundtrack.length == 0) {
            return
        }
        const songArtistStringArray = soundtrack.map(track => {
            return `${track.track_name} - ${track.track_artists.join(', ')}`
        })
        const uploadString = songArtistStringArray.join('\n')
        const stravaAccessToken = await getStravaToken(athlete_id)
        let activityDescription = uploadString + '\n' + "- MoovIt 🐮 [moovit.onrender.com]"
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
        console.log("posted songs to " + athlete_id + "'s activity!")
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`)
        }
    } catch (error) {
        console.log("error", error)
    }
}

// returns a soundtrack: an array of objects
// {
//     track_name: string,
//     track_artists: [string],
//     link: string
// }
async function getActivitySoundtrack(athlete_id, activity_id) {
    // search DB to see if an activitySoundtrack document already exists
    try {
        const activitySoundtrackDocument = await ActivitySoundtrack.findOne({activity_id: activity_id, athlete_id: athlete_id})
        if (activitySoundtrackDocument) {
            console.log("Found activitySoundtrack in DB")
            return activitySoundtrackDocument.tracks
        }
    } catch (error) {
        console.log("Error finding activitySoundtrack in DB: ", error)
    }    
    // if soundtrack does not exist in DB, fetch from respective APIs
    try {
        const soundtrack = await fetchActivitySoundtrack(athlete_id, activity_id)
        return soundtrack
    } catch (error) {
        console.error("error in fetching activitySoundrack", error)
    }
}

// fetches data from API calls and caches in DB
async function fetchActivitySoundtrack(athlete_id, activity_id) {
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
        if (!songsAfterStartResponse.ok) {
            console.error("Error: ", songsAfterStartResponse.status, songsAfterStartResponse.statusText)
        }
        var songsAfterStart = await songsAfterStartResponse.json()
        const songsBeforeEndResponse = await fetch(`https://api.spotify.com/v1/me/player/recently-played?limit=50&before=${end_time}`, {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + spotifyAccessToken
            }
        })
        var songsBeforeEnd = await songsBeforeEndResponse.json()
    } catch (error) {
        console.error("error in fetching data from API calls", error)
    }

    try {
        const songSet = new Set(songsBeforeEnd.items.map(obj => obj.played_at))
        const songsDuringActivity = songsAfterStart.items.filter(obj => songSet.has(obj.played_at))
        let soundtrack = songsDuringActivity.map(obj => {
            return {
                track_name: obj.track.name,
                track_artists: obj.track.artists.map(artist => artist.name),
                link: obj.track.external_urls.spotify
            }
        })
        soundtrack.reverse()
        // store a new activitySoundtrack in DB
        await ActivitySoundtrack.create({
            activity_id: activity_id,
            athlete_id: athlete_id,
            tracks: soundtrack
        })
        console.log("saved activitySoundtrack to DB")
        return soundtrack
    } catch (error) {
        console.error("error in aggregating songs, or saving to DB", error)
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
