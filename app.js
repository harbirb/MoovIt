const express = require("express");
require('dotenv').config();

const CLIENT_ID = process.env.CLIENT_ID;

const app = express();

app.listen(8080, () => {
    console.log("Server is running on port http://localhost:8080")
})


app.use(express.static('public'))
// app.use(express.json())

app.get("/", (req, res)=> {
    res.send("Hello world")
})

app.get('/auth/strava', (req, res) => {
    const stravaAuthUrl = `http://www.strava.com/oauth/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=http://localhost:8080/exchange_token&approval_prompt=force&scope=read`
    res.redirect(stravaAuthUrl)
})

app.get('/exchange_token', (req, res) => {
    
    const params = req.query;
    console.log("get req completed", params)
    res.send("Got redirected, check string for auth outcome")
})

app.put('/exchange_token', (req, res) => {
    const params = req.params
    console.log(params);
    res.send(params)
})


