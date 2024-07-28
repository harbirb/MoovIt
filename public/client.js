document.addEventListener('DOMContentLoaded', async () => {
    const loginSpotifyButton = document.getElementById('loginSpotifyButton');
    const loginStravaButton = document.getElementById('loginStravaButton');
    console.log("hellOOOOOO OWLRD")

    await checkAuthStatus();
    
    async function checkAuthStatus() {
        try {
            const response = await fetch('/authStatus')
            const authStatus = await response.json()
            if (authStatus.strava) {
                loginStravaButton.style.display = 'none'
            }
            if (authStatus.spotify) {
                loginSpotifyButton.style.display = 'none'
            }
            console.log(authStatus)
        } catch (error) {
            console.error("error in checking auth status", error)
        }
    }
})