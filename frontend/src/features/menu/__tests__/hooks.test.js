import { filterMenu, groupByCategory } from '../hooks.js';

const items = [
  {
    _id: '1',
    name: 'Masala Chai',
    description: 'Hot',
    isVeg: true,
    categoryId: 'c1',
    tags: ['hot'],
  },
  { _id: '2', name: 'Chicken Burger', isVeg: false, categoryId: 'c2' },
  { _id: '3', name: 'Veg Burger', description: 'Crispy patty', isVeg: true, categoryId: 'c2' },
];
const cats = [
  { _id: 'c1', name: 'Chai' },
  { _id: 'c2', name: 'Fast Food' },
  { _id: 'c3', name: 'Empty' },
];

describe('menu filtering', () => {
  it('filters by veg, text (name/description/tags) and category', () => {
    expect(filterMenu(items, { veg: true }).map((i) => i._id)).toEqual(['1', '3']);
    expect(filterMenu(items, { q: 'burger' }).map((i) => i._id)).toEqual(['2', '3']);
    expect(filterMenu(items, { q: 'CRISPY' }).map((i) => i._id)).toEqual(['3']);
    expect(filterMenu(items, { q: 'hot' }).map((i) => i._id)).toEqual(['1']);
    expect(filterMenu(items, { categoryId: 'c2', veg: true }).map((i) => i._id)).toEqual(['3']);
    expect(filterMenu(items, { q: '  ' })).toHaveLength(3);
  });
  it('groups by category in category order and skips empty groups', () => {
    const groups = groupByCategory(cats, items);
    expect(groups.map((g) => g.category.name)).toEqual(['Chai', 'Fast Food']);
    expect(groups[1].items).toHaveLength(2);
  });
});
