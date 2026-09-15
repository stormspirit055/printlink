import provinces from '@province-city-china/province';
import cities from '@province-city-china/city';
import areas from '@province-city-china/area';

export const provinceOptions = provinces.map((item) => ({ value: item.name, label: item.name }));

export function cityOptions(provinceName: string) {
  const province = provinces.find((item) => item.name === provinceName);
  if (!province) return [];
  return cities
    .filter((item) => item.province === province.province)
    .map((item) => ({ value: item.name, label: item.name }));
}

export function districtOptions(provinceName: string, cityName: string) {
  const province = provinces.find((item) => item.name === provinceName);
  const city = province && cities.find((item) => item.province === province.province && item.name === cityName);
  if (!city) return [];
  return areas
    .filter((item) => item.province === city.province && item.city === city.city)
    .map((item) => ({ value: item.name, label: item.name }));
}
