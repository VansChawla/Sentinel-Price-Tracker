import axios from 'axios';

// 1. Create your central Axios instance
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
});

// 2. Add a request interceptor to inject the token automatically before sending
api.interceptors.request.use(
  (config) => {
    // Retrieve the permanent token you stored during login
    const token = localStorage.getItem('userToken'); 
    
    if (token) {
      config.headers['token'] = token;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default api;