function populateTable(data) {
  const tableBody = document.querySelector("#songTable tbody");
  data.forEach((item) => {
    const row = document.createElement("td");
    row.className = "activityContainer";
    const title = document.createElement("h2");
    title.className = "activityTitle";
    title.textContent = item.name;
    const date = document.createElement("h3");
    date.className = "activityDate";
    const dateObj = new Date(item.start_date_local);
    const options = {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "UTC",
    };
    const formattedDate = dateObj.toLocaleString("en-US", options);
    date.textContent = formattedDate;
    const activityLink = document.createElement("a");
    activityLink.href = `https://www.strava.com/activities/${item.activity_id}`;
    activityLink.textContent = "View on Strava";
    activityLink.className = "activityLink";
    const createPlayListButton = document.createElement("button");
    createPlayListButton.onclick = () => {
      createPlaylist(item.activity_id);
    };
    createPlayListButton.textContent = "Create Playlist on Spotify";
    const songs = document.createElement("div");
    songs.className = "songList";
    if (item.soundtrack.length > 0) {
      item.soundtrack.map((track) => {
        const songLink = document.createElement("a");
        songLink.href = track.link;
        songLink.className = "songLink";
        const songName = document.createElement("p");
        songName.textContent = track.track_name;
        songName.className = "songName";
        const songArtists = document.createElement("p");
        songArtists.textContent = track.track_artists.join(", ");
        songArtists.className = "songArtists";
        songLink.append(songName, songArtists);
        songs.append(songLink);
      });
    } else {
      songs.innerHTML = "No songs found for this activity";
    }
    row.appendChild(title);
    row.appendChild(date);
    row.appendChild(activityLink);
    row.appendChild(createPlayListButton);
    row.appendChild(songs);
    tableBody.appendChild(row);
  });
}

async function createPlaylist(activity_id) {
  const response = await fetch("/api/create-activity-playlist", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ activity_id }),
  });
  if (!response.ok) {
    console.error("ERROR:", response.statusText);
    return;
  }
  const data = await response.json();
  console.log(data);
}

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("loading").style.display = "block";
  try {
    const response = await fetch("/api/recent-activities");
    const activityPlaylistArray = await response.json();
    populateTable(activityPlaylistArray);
    document.getElementById("loading").style.display = "none";
  } catch (error) {
    console.log("Error in fetching recent activities", error);
  }
});
