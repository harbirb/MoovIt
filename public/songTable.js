function populateTable(data) {
    const tableBody = document.querySelector("#songTable tbody")
    data.forEach(item => {
        const row = document.createElement("tr")
        const title = document.createElement("h2")
        title.textContent = item.name
        const date = document.createElement("h3")
        date.textContent = item.start_date
        const songs = document.createElement("p")
        if (item.playList.length > 0) {
            songs.innerHTML = item.playList.join('<br>')
        } else {
            // this should be returned by the API instead when no songs found
            songs.innerHTML = "No songs found for this activity"
        }
        
        row.appendChild(title)
        row.appendChild(date)
        row.appendChild(songs)
        tableBody.appendChild(row)
    })
}

const toggleButton = document.getElementById('toggleButton');
const statusText = document.getElementById('status');

// Update the status text based on the toggle state
toggleButton.addEventListener('change', () => {
    if (toggleButton.checked) {
        statusText.textContent = 'On';
    } else {
        statusText.textContent = 'Off';
    }
});