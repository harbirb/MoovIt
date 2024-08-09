function populateTable(data) {
    const tableBody = document.querySelector("#songTable tbody")
    data.forEach(item => {
        const row = document.createElement("tr")
        const title = document.createElement("h2")
        title.textContent = item.name
        const date = document.createElement("h3")
        date.textContent = item.start_date
        const anchor = document.createElement('a')
        anchor.href = `https://www.strava.com/activities/${item.activity_id}`
        anchor.textContent = "View on Strava"
        anchor.style.textDecoration = 'underline';
        const songs = document.createElement("p")
        if (item.playlist.length > 0) {
            songs.innerHTML = item.playlist.join('<br>')
        } else {
            // this should be returned by the API instead when no songs found
            songs.innerHTML = "No songs found for this activity"
        }
        
        row.appendChild(title)
        row.appendChild(date)
        row.appendChild(anchor)
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
        await fetch('/user/toggleIsSubscribed', {
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
        const response = await fetch('/user/isSubscribed')
        toggleButton.checked = await response.json()
        statusText.textContent = toggleButton.checked ? 'On' : 'Off'
    } catch (error) {
        console.error('Error fetching user preferences:', error)
    }

    try {
        const response = await fetch('/recent-activities')
        const activityPlaylistArray = await response.json()
        populateTable(activityPlaylistArray)
    } catch (error) {
        console.log('Error in fetching recent activities', error)
    }
})

