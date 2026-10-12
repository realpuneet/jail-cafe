import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toApiError } from '../../lib/apiError.js';
import { keys } from '../../lib/queryKeys.js';
import { toast } from '../ui/uiStore.js';
import * as addressApi from './api.js';

export const useAddresses = () =>
  useQuery({ queryKey: keys.addresses, queryFn: addressApi.fetchAddresses });

/** CRUD mutations for addresses; every success refreshes the list. */
export function useAddressMutations() {
  const qc = useQueryClient();
  const done = (message) => () => {
    qc.invalidateQueries({ queryKey: keys.addresses });
    qc.invalidateQueries({ queryKey: ['checkout-preview'] });
    if (message) toast.success(message);
  };
  const fail = (err) => toast.error(toApiError(err).message);
  return {
    create: useMutation({
      mutationFn: addressApi.createAddress,
      onSuccess: done('Address saved'),
      onError: fail,
    }),
    update: useMutation({
      mutationFn: addressApi.updateAddress,
      onSuccess: done('Address updated'),
      onError: fail,
    }),
    remove: useMutation({
      mutationFn: addressApi.deleteAddress,
      onSuccess: done('Address removed'),
      onError: fail,
    }),
    makeDefault: useMutation({
      mutationFn: addressApi.setDefaultAddress,
      onSuccess: done(),
      onError: fail,
    }),
  };
}
