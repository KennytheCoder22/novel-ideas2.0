import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { Image, Text, View } from 'react-native';
import type { GameRecommendationRewardBook } from '../../../components/GameRecommendationReward';

export function useUnwrittenMapBooks(scope: string) {
  const key = `unwritten-map-liked-books-v1:${scope}`;
  const [books, setBooks] = useState<GameRecommendationRewardBook[]>([]);
  const active = useRef(key);
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    active.current = key;
    setBooks([]);
    let cancelled = false;
    queue.current = queue.current.then(async () => {
      try {
        const raw = JSON.parse(await AsyncStorage.getItem(key) || '[]');
        if (!cancelled && Array.isArray(raw)) setBooks(raw.filter(b => b && typeof b.title === 'string' && typeof b.author === 'string').slice(-24));
      } catch { /* An unreadable optional shelf must not block the journey. */ }
    });
    return () => { cancelled = true; };
  }, [key]);
  function remember(book: GameRecommendationRewardBook) {
    queue.current = queue.current.then(async () => {
      try {
        const raw = JSON.parse(await AsyncStorage.getItem(key) || '[]');
        const previous: GameRecommendationRewardBook[] = Array.isArray(raw) ? raw.filter(b => b && typeof b.title === 'string' && typeof b.author === 'string') : [];
        const next = [...previous.filter(b => b.title !== book.title || b.author !== book.author), book].slice(-24);
        await AsyncStorage.setItem(key, JSON.stringify(next));
        if (active.current === key) setBooks(next);
      } catch { /* Core feedback remains in its independent durable queue. */ }
    });
  }
  return { books, remember };
}

export function UnwrittenMapBooks({ books }: { books: GameRecommendationRewardBook[] }) {
  return <View style={{ width: '100%', maxWidth: 940, padding: 20, gap: 14, backgroundColor: '#eee0b6', borderRadius: 12, marginVertical: 16 }}>
    <Text style={{ fontSize: 23, fontWeight: '800', color: '#234e3e' }}>Your next adventures</Text>
    <Text style={{ color: '#343c2c', lineHeight: 22 }}>Books you liked along the way, kept on this device for this player.</Text>
    {books.length ? books.map(book => <View key={`${book.title}:${book.author}`} style={{ flexDirection: 'row', gap: 14 }}>
      {book.coverUrl ? <Image source={{ uri: book.coverUrl }} accessibilityLabel={`Cover of ${book.title}`} style={{ width: 55, height: 82 }} /> : null}
      <View style={{ flex: 1 }}><Text style={{ color: '#234e3e', fontSize: 17, fontWeight: '700' }}>{book.title}</Text><Text style={{ color: '#343c2c' }}>{book.author}</Text></View>
    </View>) : <Text style={{ color: '#343c2c' }}>No books saved yet. A “Yes” to a book discovery adds it here.</Text>}
  </View>;
}
