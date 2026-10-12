import { Address } from '../../src/models/Address.js';
import { Category } from '../../src/models/Category.js';
import { DeliveryZone } from '../../src/models/DeliveryZone.js';
import { MenuItem } from '../../src/models/MenuItem.js';

/** Catalog + a pincode delivery zone. Prices in paise. */
export async function seedCatalog() {
  const category = await Category.create({ name: 'Chai', slug: 'chai' });
  const chai = await MenuItem.create({
    name: 'Masala Chai',
    slug: 'masala-chai',
    categoryId: category._id,
    isVeg: true,
    price: 2000,
    taxPercent: 5,
  });
  const burger = await MenuItem.create({
    name: 'Burger',
    slug: 'burger',
    categoryId: category._id,
    isVeg: false,
    price: 10000,
    taxPercent: 5,
    variants: [
      { name: 'Regular', price: 10000 },
      { name: 'Large', price: 15000 },
    ],
    addOns: [
      { name: 'Extra Cheese', price: 2500 },
      { name: 'Sold Out Sauce', price: 500, isAvailable: false },
    ],
  });
  const zone = await DeliveryZone.create({
    name: 'Central',
    kind: 'pincode',
    pincodes: ['452001'],
    deliveryCharge: 3000,
    freeDeliveryAbove: 100000,
    minOrderAmount: 10000,
  });
  return { category, chai, burger, zone };
}

export const makeAddress = (userId, over = {}) =>
  Address.create({
    userId,
    name: 'Puneet',
    phone: '+919876543210',
    line1: '12 MG Road',
    city: 'Indore',
    state: 'MP',
    pincode: '452001',
    isDefault: true,
    ...over,
  });
