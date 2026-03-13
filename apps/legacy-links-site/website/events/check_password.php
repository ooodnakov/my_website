<?php
function cmp($a, $b)
{
    return $a['dateTime'] <=> $b['dateTime'];
}

// Set the password
$correct_password = "ym";
$action = $_POST['action'];

// Check the action requested
if (isset($action)) {
    if ($action === "check_password") {
        if (isset($_POST['password']) && $_POST['password'] == $correct_password) {
            echo 'success';
        } else {
            echo 'failure';
        }
    } elseif ($action === "save_event" && isset($_POST['password']) && $_POST['password'] == $correct_password) {
        // Read and decode the events.json file
        $json_string = file_get_contents("events.json");
        $events = json_decode($json_string, true);
        if (!is_array($events)) {
            $events = array();
        }
        $chatLink = preg_replace('/( )/','+',$_POST['chatLink']);
        // Add a new event to the events array
        $new_event = array(
            "text" => $_POST['text'],
            "dateTime" => $_POST['dateTime'],
            "duration" => $_POST['duration'],
            "chatLink" => $chatLink
        );
        array_push($events, $new_event);

        // Write the updated events array back into the events.json file
        usort($events, "cmp");
        $json_string = json_encode($events, JSON_PRETTY_PRINT);
        file_put_contents("events.json", $json_string);
        // debug_to_console("success");
        echo "success";
    } elseif ($action === "delete_event" && isset($_POST['password']) && $_POST['password'] == $correct_password) {
        // Read and decode the events.json file
        $json_string = file_get_contents("events.json");
        $events = json_decode($json_string, true);
        if (!is_array($events)) {
            echo "failure";
        }
        else{
            // Delete element by index
            $index = $_POST['indexV'];
            array_splice($events, $index, 1);;
            // Write the updated events array back into the events.json file
            $json_string = json_encode($events, JSON_PRETTY_PRINT);
            file_put_contents("events.json", $json_string);
            echo "success";
        }
    } else {
        echo "Invalid action";
    }
}
?>
