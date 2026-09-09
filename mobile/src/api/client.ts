import axios from 'axios';
import Constants from 'expo-constants';

const host = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';

export const API_URL = `http://${host}:4001/api/v1`;

export const api = axios.create({ baseURL: API_URL });
