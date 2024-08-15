function populateTable(data) {
    const tableBody = document.querySelector("#songTable tbody")
    data.forEach(item => {
        const row = document.createElement("tr")
        const title = document.createElement("h2")
        title.textContent = item.name
        const date = document.createElement("h3")
        const dateObj = new Date(item.start_date_local)
        const options = {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
            timeZone: 'UTC' 
        }
        const formattedDate = dateObj.toLocaleString('en-US', options)
        date.textContent = formattedDate
        const activityLink = document.createElement('a')
        activityLink.href = `https://www.strava.com/activities/${item.activity_id}`
        activityLink.textContent = "View on Strava"
        activityLink.style.textDecoration = 'underline'
        const songs = document.createElement("div")
        songs.className = "songList"
        if (item.soundtrack.length > 0) {
            item.soundtrack.map(track => {
                const songLink = document.createElement('a')
                songLink.href = track.link
                songLink.className = "songLink"
                const songName = document.createElement('p')
                songName.textContent = track.track_name
                songName.className = 'songName'
                const songArtists = document.createElement('p')
                songArtists.textContent = track.track_artists.join(', ')
                songArtists.className = 'songArtists'
                songLink.append(songName, songArtists)
                songs.append(songLink)
            })
        } else {
            songs.innerHTML = "No songs found for this activity"
        }        
        row.appendChild(title)
        row.appendChild(date)
        row.appendChild(activityLink)
        row.appendChild(songs)
        tableBody.appendChild(row)
    })
}

const toggleButton = document.getElementById('toggleButton');
const statusText = document.getElementById('status');

// Update the status text based on the toggle state
toggleButton.addEventListener('change', async () => {
    if (toggleButton.checked) {
        statusText.textContent = 'On'
    } else {
        statusText.textContent = 'Off';
    }
    try {
        await fetch('/api/user/toggleIsSubscribed', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({newSubscriptionStatus: toggleButton.checked})
        })
    } catch (error) {
        console.log(error)
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/api/user/isSubscribed')
        toggleButton.checked = await response.json()
        statusText.textContent = toggleButton.checked ? 'On' : 'Off'
    } catch (error) {
        console.error('Error fetching user preferences:', error)
    }

    document.getElementById("loading").style.display = "block"
    try {
        const response = await fetch('/api/recent-activities')
        const activityPlaylistArray = await response.json()
        populateTable(activityPlaylistArray)
        document.getElementById("loading").style.display = "none"
    } catch (error) {
        console.log('Error in fetching recent activities', error)
    }
})

