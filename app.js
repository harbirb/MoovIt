const express = require("express");
const axios = require('axios')


require('dotenv').config();


const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

const app = express();



let ACCESS_TOKEN;

app.listen(8080, () => {
    console.log("Server is running on port http://localhost:8080")
})

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
        ACCESS_TOKEN = response.data.access_token
        res.send(response.data)
        console.log(ACCESS_TOKEN)
    }
    catch (error) {
        console.error("Existing code doesnt work")
    }
})



