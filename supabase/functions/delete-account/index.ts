import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function getStoragePath(imageUrl: string) {
  const marker = "/storage/v1/object/public/review-images/";
  const markerIndex = imageUrl.indexOf(marker);
  return markerIndex === -1
    ? null
    : decodeURIComponent(imageUrl.slice(markerIndex + marker.length));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization");

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
    return new Response(JSON.stringify({ error: "Unauthorized." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const accessToken = authorization.replace(/^Bearer\s+/i, "");
  const authClient = createClient(supabaseUrl, anonKey);
  const { data: userData, error: userError } =
    await authClient.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: "Unauthorized." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userId = userData.user.id;

  const { data: reviews, error: reviewsError } = await adminClient
    .from("reviews")
    .select("id")
    .eq("user_id", userId);

  if (reviewsError) {
    return new Response(JSON.stringify({ error: reviewsError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let imagePaths: string[] = [];
  const reviewIds = (reviews ?? []).map((review) => review.id);
  if (reviewIds.length > 0) {
    const { data: images, error: imagesError } = await adminClient
      .from("review_images")
      .select("image_url")
      .in("review_id", reviewIds);

    if (imagesError) {
      return new Response(JSON.stringify({ error: imagesError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    imagePaths = (images ?? [])
      .map((image) => getStoragePath(image.image_url))
      .filter((path): path is string => Boolean(path));
  }

  // Auth deletion is performed first. If an FK blocks deletion, no Storage
  // object is removed and the account remains intact.
  const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(
    userId,
  );

  if (deleteUserError) {
    return new Response(JSON.stringify({ error: deleteUserError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let storageWarning = null;
  if (imagePaths.length > 0) {
    const { error: storageError } = await adminClient.storage
      .from("review-images")
      .remove(imagePaths);
    storageWarning = storageError?.message ?? null;
  }

  return new Response(JSON.stringify({ deleted: true, storageWarning }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
