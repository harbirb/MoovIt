const express = require("express");
const axios = require('axios')
const mongoose = require('mongoose');

require('dotenv').config();


const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

const app = express();



let ACCESS_TOKEN;

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
    // const tokenGroup = new Tokens({
    //     athlete_id: athlete_id,
    //     access_token: access_token,
    //     refresh_token: refresh_token,
    //     expires_at: expires_at,
    //     expires_in: expires_in
    // });

    const filter = { athlete_id: athlete_id}
    const update = {access_token: access_token,
                    refresh_token: refresh_token,  
                    expires_at: expires_at,
                    expires_in: expires_in}

    try {
        await Tokens.deleteMany({ athlete_id: { $exists: false } });
        const savedTokens = await Tokens.findOneAndUpdate(filter, update, {
            new: true, upsert: true
        });
        console.log("saved successfully", savedTokens)
    } catch (error) {
        console.log("error saving tokens", error)        
    }
}

app.use(express.static('public'))
app.use(express.json())

app.get("/", (req, res)=> {
    res.send("Hello world")
})

app.get('/auth/strava', (req, res) => {
    const stravaAuthUrl = `http://www.strava.com/oauth/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=http://localhost:8080/exchange_token&approval_prompt=force&scope=read`
    res.redirect(stravaAuthUrl)
})


app.get('/exchange_token', async (req, res) => {
    const params = req.query;
    const AUTH_CODE = params.code
    let ACCESS_TOKEN;
    if ('error' in params) {
        res.send("Error in auth: access denied")
    }
    try {
        const response = await axios.post("https://www.strava.com/oauth/token", {
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            code: AUTH_CODE,
            grant_type: 'authorization_code'
        })
        const { expires_at, expires_in, refresh_token, access_token, athlete: {id: athlete_id} } = response.data;
        // res.send(response.data)
        storeTokens(athlete_id, access_token, refresh_token, expires_at, expires_in)
        res.send(await Tokens.find())
    }
    catch (error) {
        console.error("Existing code doesnt work")
    }
})



