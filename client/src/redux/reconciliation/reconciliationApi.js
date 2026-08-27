import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

const BASE_URL = import.meta.env.VITE_API_URL;

export const reconciliationApi = createApi({
  reducerPath: "reconciliationApi",
  baseQuery: fetchBaseQuery({ baseUrl: BASE_URL, credentials: "include" }),
  tagTypes: ["Reconciliation"],
  endpoints: (builder) => ({
    getMetrics: builder.query({ query: () => "/reconciliation/metrics", providesTags: ["Reconciliation"] }),
    getResults: builder.query({ query: () => "/reconciliation/results", providesTags: ["Reconciliation"] }),
    runReconciliation: builder.mutation({ query: () => ({ url: "/reconciliation/run", method: "POST" }), invalidatesTags: ["Reconciliation"] }),
    toggleSimulation: builder.mutation({ query: (enabled) => ({ url: "/reconciliation/simulate-llm-failure", method: "POST", body: { enabled } }) }),
    reviewResult: builder.mutation({ query: ({ id, decision }) => ({ url: `/reconciliation/${id}/${decision}`, method: "PATCH" }), invalidatesTags: ["Reconciliation"] }),
  }),
});

export const { useGetMetricsQuery, useGetResultsQuery, useRunReconciliationMutation, useToggleSimulationMutation, useReviewResultMutation } = reconciliationApi;
