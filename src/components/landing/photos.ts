/**
 * Fotos de la landing (Unsplash, licencia libre: https://unsplash.com/license).
 * Descargadas a 1200px en /public/photos. El crédito aparece en el footer.
 */
export interface Photo {
  src: string;
  w: number;
  h: number;
  alt: string;
  by: string;
}

const p = (n: string, w: number, h: number, alt: string, by: string): Photo => ({
  src: `/photos/p${n}.jpg`,
  w,
  h,
  alt,
  by,
});

export const PHOTOS = {
  toastRed: p("01", 1200, 1799, "Friends toasting red wine over a candlelit dinner table", "krakenimages"),
  clinkPizza: p("02", 1200, 1500, "Two glasses of red wine clinking over pizza and pasta", "Davey Gravy"),
  candlelit: p("03", 1200, 800, "A group dining by candlelight in a dim restaurant", "Romain Gal"),
  pizzaParty: p("04", 1200, 1800, "Hands reaching for pizza and fried chicken on a checkered cloth", "No Revisions"),
  charcuterie: p("05", 1200, 676, "Overhead view of friends sharing a charcuterie board", "The Cheeserom"),
  champagne: p("06", 1200, 1800, "Friends toasting with champagne at a celebration", "Desiray Green"),
  sunlit: p("07", 1200, 1800, "A sunlit restaurant table set for dinner", "Philipp Hubert"),
  cocktailsTop: p("08", 1200, 800, "Overhead view of friends clinking cocktails over shared plates", "Negley Stockman"),
  longTable: p("09", 1200, 1798, "A long table of people dining under warm lights", "mona Masoumi"),
  tableSet: p("10", 1200, 800, "A long dining table set with plates and candles", "Nadia Valko"),
  nightMarket: p("11", 1200, 1600, "A crowded night market with people eating at shared tables", "Yoav Aziz"),
  skewers: p("12", 1200, 1600, "A vendor handing skewers to a customer at a night market", "Nate Holland"),
  sunset: p("14", 1200, 800, "Four friends with arms around each other watching the sunset", "Helena Lopes"),
  rooftop: p("15", 1200, 675, "Friends taking a selfie on a city rooftop", "Vitaly Gariev"),
  bar: p("16", 1200, 800, "Three cocktails on a bar counter", "Daniel"),
} satisfies Record<string, Photo>;

export const CREDITS = [...new Set(Object.values(PHOTOS).map((x) => x.by))];
