<?php
// Read and return the content of the events.json file
$json_string = file_get_contents("events.json");
echo $json_string;
?>