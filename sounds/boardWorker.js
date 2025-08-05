// boardWorker.js

/**
 * Adım 1: Gerekli kütüphaneyi ve fonksiyonları içeri aktar.
 * Web Worker'lar standart 'import' kullanamaz, bu yüzden 'importScripts' kullanıyoruz.
 */
importScripts('https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js');

/**
 * Adım 2: createBoard fonksiyonunun ihtiyaç duyduğu yardımcı fonksiyonları ve sabitleri tanımla.
 * Bu kodlar daha önce index.html dosyasındaydı.
 */
function customToUpperCase(str) {
  if (typeof str !== 'string') return '';
  try {
    return str.replace(/i/g, 'İ').replace(/ı/g, 'I').replace(/ğ/g, 'Ğ').replace(/ü/g, 'Ü').replace(/ş/g, 'Ş').replace(/ö/g, 'Ö').replace(/ç/g, 'Ç').toUpperCase();
  } catch (err) {
    console.error('customToUpperCase hatası:', err);
    return (str || '').toUpperCase();
  }
}

const directions = {
  diagonal: [ { name: 'down-right', dx: 1, dy: 1 }, { name: 'down-left', dx: 1, dy: -1 }, { name: 'up-right', dx: -1, dy: 1 }, { name: 'up-left', dx: -1, dy: -1 } ],
  horizontal: [ { name: 'right', dx: 0, dy: 1 }, { name: 'left', dx: 0, dy: -1 } ],
  vertical: [ { name: 'down', dx: 1, dy: 0 }, { name: 'up', dx: -1, dy: 0 } ]
};
const allDirections = [...directions.diagonal, ...directions.horizontal, ...directions.vertical];

/**
 * Adım 3: Ana oyun tahtası oluşturma fonksiyonu.
 * Bu fonksiyon, index.html dosyasından birebir kopyalandı.
 * Artık ana arayüzü dondurmadan bu dosyada, arka planda çalışacak.
 */
function createBoard(level, language, wordLists, charSets, boardSizes) {
  try {
    const staticConfig = boardSizes[level];
    if (!staticConfig) {
      console.error(`Geçersiz seviye yapılandırması: ${level}.`);
      return null;
    }
    const { rows, cols } = staticConfig;

    for (let attempt = 0; attempt < 100; attempt++) {
      const board = Array(rows).fill(null).map(() => Array(cols).fill(''));
      const lockGrid = Array(rows).fill(null).map(() => Array(cols).fill(false));
      let placedWordsInfo = [];

      const allWords = (wordLists[language] || []).filter(w => w && w.length >= 2).map(customToUpperCase);
      let potentialWords = _.shuffle(allWords);

      const placeAndLockWord = (word, r, c, dir) => {
        const positions = [];
        for (let i = 0; i < word.length; i++) {
          const nr = r + i * dir.dx;
          const nc = c + i * dir.dy;
          board[nr][nc] = word[i];
          lockGrid[nr][nc] = true;
          positions.push({ row: nr, col: nc });
        }
        placedWordsInfo.push({ word, positions, direction: dir.name });
      };
      
      const canPlaceWithoutOverlap = (word, r, c, dir) => {
        for (let i = 0; i < word.length; i++) {
          const nr = r + i * dir.dx;
          const nc = c + i * dir.dy;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || lockGrid[nr][nc]) {
            return false;
          }
        }
        return true;
      };

      const minDiagonalWords = 6;
      let diagonalsPlaced = 0;
      let usedForDiagonal = [];

      for (const word of potentialWords) {
        if (diagonalsPlaced >= minDiagonalWords) break;
        if (word.length > Math.min(rows, cols)) continue;

        let availablePositions = [];
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            for (const dir of directions.diagonal) {
              if (canPlaceWithoutOverlap(word, r, c, dir)) {
                availablePositions.push({ r, c, dir });
              }
            }
          }
        }

        if (availablePositions.length > 0) {
          const { r, c, dir } = _.sample(availablePositions);
          placeAndLockWord(word, r, c, dir);
          usedForDiagonal.push(word);
          diagonalsPlaced++;
        }
      }
      
      if (diagonalsPlaced < minDiagonalWords) continue;

      potentialWords = potentialWords.filter(w => !usedForDiagonal.includes(w));
      const targetTotalWordCount = 15 + Math.floor(level / 4);

      for (const word of potentialWords) {
        if (placedWordsInfo.length >= targetTotalWordCount) break;

        let availablePositions = [];
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            for (const dir of allDirections) {
              if (canPlaceWithoutOverlap(word, r, c, dir)) {
                availablePositions.push({ r, c, dir });
              }
            }
          }
        }

        if (availablePositions.length > 0) {
          const { r, c, dir } = _.sample(availablePositions);
          placeAndLockWord(word, r, c, dir);
        }
      }

      const emptyCells = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (!lockGrid[r][c]) emptyCells.push({ r, c });
        }
      }
      
      let targetHiddenWordLength = Math.min(12, 5 + Math.floor(level / 3));

      if (emptyCells.length < targetHiddenWordLength) continue;

      let hiddenWord = null;
      let currentHiddenWordLength = targetHiddenWordLength;

      while (!hiddenWord && currentHiddenWordLength >= 4) {
        const suitableHiddenWords = allWords.filter(w => 
            w.length === currentHiddenWordLength && !placedWordsInfo.some(p => p.word === w)
        );
        if (suitableHiddenWords.length > 0) {
          hiddenWord = _.sample(suitableHiddenWords);
        } else {
          currentHiddenWordLength--; 
        }
      }
      
      if (!hiddenWord) continue;      
      const cellsForHidden = _.sampleSize(emptyCells, hiddenWord.length);
      const scatteredHiddenLetterPositions = [];
      
      cellsForHidden.forEach((cell, i) => {
        board[cell.r][cell.c] = hiddenWord[i];
        lockGrid[cell.r][cell.c] = true; 
        scatteredHiddenLetterPositions.push({ row: cell.r, col: cell.c });
      });
      
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (board[r][c] === '') {
            board[r][c] = _.sample(charSets[language]);
          }
        }
      }
      
      const finalWords = _.sortBy(placedWordsInfo, 'word');
      // Başarılı bir şekilde oluşturulan oyun durumunu döndür
      return { board, words: finalWords, hiddenWord, scatteredHiddenLetterPositions };
    }
    
    console.error("Tahta oluşturma denemeleri 100 denemeden sonra başarısız oldu.");
    return null;

  } catch (e) {
    console.error(`createBoard kritik hatası:`, e);
    return null;
  }
}

/**
 * Adım 4: Ana dosyadan (index.html) gelen mesajı dinle.
 */
self.onmessage = function(e) {
    // index.html'den gönderilen verileri al
    const { level, language, wordLists, charSets, boardSizes } = e.data;

    // Ağır olan createBoard fonksiyonunu çağır
    const gameState = createBoard(level, language, wordLists, charSets, boardSizes);

    // Hesaplama bitince, sonucu ana dosyaya geri gönder
    self.postMessage(gameState);
};