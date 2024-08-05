function populateTable(data) {
    const tableBody = document.querySelector("#datatable tbody")
    data.forEach(item => {
        const row = document.createElement("tr")
        const title = document.createElement("h2")
        title.textContent = data.name
        const date = document.createElement("h3")
        date.textContent = data.start_date
        const songs = document.createElement("p")
        songs.innerHTML = data.playList.join('<br>')
        row.appendChild(title)
        row.appendChild(date)
        row.appendChild(songs)
        tableBody.appendChild(row)
    })
}