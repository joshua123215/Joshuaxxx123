export interface Movie {
  id: number;
  title: string;
  year: number;
  overview: string;
  genre: string;
  rating: number;
  posterUrl?: string; // We'll add this on the client
}
