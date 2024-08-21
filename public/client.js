document.addEventListener('DOMContentLoaded', async () => {
    const loginSpotifyButton = document.getElementById('loginSpotifyButton');
    const loginStravaButton = document.getElementById('loginStravaButton');
    const showSongsButton = document.getElementById('showSongsButton');
    await checkAuthStatus();
    
    async function checkAuthStatus() {
        try {
            const response = await fetch('/auth-status')
            const authStatus = await response.json()
            if (authStatus.strava) {
                loginStravaButton.disabled = true
                loginStravaButton.textContent = "Connected to Strava"
            }
            if (!!authStatus.strava == false) {
                loginSpotifyButton.disabled = true
            }
            if (authStatus.spotify) {
                loginSpotifyButton.disabled = true
                loginSpotifyButton.textContent = "Connected to Spotify"
            }
            if (authStatus.strava && authStatus.spotify) {
                showSongsButton.style.display = 'block'
            }
            console.log(authStatus)
        } catch (error) {
            console.error("error in checking auth status", error)
        }
    }
})

document.getElementById("loginSpotifyButton").addEventListener('click', () => {
    window.location.href='/auth/spotify'
})

document.getElementById("loginStravaButton").addEventListener('click', () => {
    window.location.href='/auth/strava'
})