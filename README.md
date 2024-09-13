# MoovIt is an app to find the songs that you listened to during your workouts
## Try it here: http://moovit.onrender.com

MoovIt works by oonnecting to your Strava and Spotify accounts to find when your recently played songs overlapped with your workouts.

Things I learned: 
- **Integration of Third-Party APIs**: How to effectively use OAuth for authenticating with third-party services, and securely managing the exchange of tokens.
- **Session Management and Persistence**: Implementing session management using express-session with MongoDB as a session store, ensuring persistence across server restarts.
- **Middleware Usage**: Applying custom middleware for authentication and access control across multiple routes in an application.
- **Database Schema Design**: Structuring MongoDB schemas to store user data, access tokens, and application-specific data like activity soundtracks.
- **Intelligent Caching**: Storing frequently accessed data to minimize repetitive API calls, thereby improving performance and reducing load on external services.
- **Webhooks**: How to implement and process webhooks to react to events from third-party services.
- **Routing and Serving Static Files**: Setting up Express to serve static files and managing routing for both API endpoints and frontend assets.
- **Session-Based Feature Toggles**: Using session data to toggle features like auto-uploading songs to Strava, allowing for a more personalized user experience.


